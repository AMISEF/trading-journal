"""AI trading coach powered by Claude (official API or any compatible gateway).

Builds a rich Persian context from every recorded field of a trade (entry,
exits, take-profits, risk/reward, realised PnL, emotions, checklist, reasons,
notes and the before/after chart screenshots) and asks the model to act as a
professional trading coach. Two entry points:

* :func:`analyze_trade`   – deep review of a single trade (with chart vision).
* :func:`analyze_overall` – coaching report across the whole journal.

Transport is plain ``httpx`` so it works against the official Anthropic API or
any compatible gateway (e.g. zyloo.io, OpenRouter). The request shape is chosen
by ``AI_API_STYLE``:

* ``"openai"``     → ``POST <base>/chat/completions`` (OpenAI-compatible),
* ``"anthropic"``  → ``POST <base>/v1/messages``       (Anthropic-compatible).

The feature is inert until an API key is configured; callers should catch
:class:`AINotConfigured` and surface a friendly message.
"""

from __future__ import annotations

import base64
import os
import random

import httpx

from app.core.config import settings
from app.models.trade import Trade
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.services import balances


class AINotConfigured(Exception):
    """Raised when the AI feature is requested but not configured."""


class AIRequestError(Exception):
    """Raised when the upstream AI request fails."""


_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

# Roughly 5 MB of raw bytes -> base64; skip anything larger to stay within
# typical per-image limits.
_MAX_IMAGE_B64 = 7_000_000

# Generous because the call runs in a background job, not a request the client
# (or an upstream proxy / Cloudflare) is holding open.
_REQUEST_TIMEOUT = 240.0

_TRADE_SYSTEM_PROMPT = """\
تو یک مربی حرفه‌ای معامله‌گری (Trading Coach) هستی که به یک معامله‌گر کریپتو کمک می‌کنی عملکردش را بهبود دهد.
یک معامله‌ی او با تمام جزئیات (شامل تصویر چارت قبل و بعد در صورت وجود) به تو داده می‌شود.

تحلیل را به زبان فارسی و در قالب Markdown با این بخش‌ها ارائه بده:

## خلاصه معامله
یک پاراگراف کوتاه از آنچه اتفاق افتاده.

## نقاط قوت
کارهای درستی که معامله‌گر انجام داده (نقطه ورود، مدیریت ریسک، صبر، حد ضرر و ...).

## نقاط ضعف و اشتباهات
مشکلات مشخص با ذکر دلیل (مثلاً نسبت ریسک به ریوارد پایین، حجم زیاد، خروج زودهنگام، نقض چک‌لیست).

## تحلیل تکنیکال تصویر
اگر تصویر چارت داده شده، ساختار قیمت، نقطه ورود/خروج و حد ضرر را نسبت به پرایس اکشن بررسی کن. اگر تصویری نیست، این بخش را حذف کن.

## روانشناسی و احساسات
بر اساس احساسات و یادداشت‌های ثبت‌شده، وضعیت ذهنی معامله‌گر را تحلیل کن.

## توصیه‌های عملی برای بهبود
۳ تا ۵ توصیه‌ی مشخص، عملی و قابل اجرا برای معاملات بعدی.

لحن حرفه‌ای، صادقانه و سازنده باشد. اگر داده‌ای ناقص است صادقانه بگو. از کلی‌گویی پرهیز کن و به اعداد واقعی همین معامله استناد کن.
"""

_OVERALL_SYSTEM_PROMPT = """\
تو یک مربی حرفه‌ای معامله‌گری (Trading Coach) هستی. کارنامه‌ی کامل معاملاتی یک معامله‌گر کریپتو
(شامل آمار کلی و فهرست معاملات) به تو داده می‌شود. هدف، کمک به بهبود کلی عملکرد اوست.

تحلیل را به زبان فارسی و در قالب Markdown با این بخش‌ها ارائه بده:

## ارزیابی کلی عملکرد
وضعیت کلی بر اساس وین‌ریت، فاکتور سود، میانگین ریسک به ریوارد و روند سرمایه.

## الگوهای تکرارشونده
الگوهای مثبت و منفی که در معاملات تکرار می‌شوند (مثلاً ضرر بیشتر در یک نماد خاص، خروج زودهنگام در سودها، اوورترید).

## مدیریت ریسک و سرمایه
ارزیابی اندازه‌ی پوزیشن، حد ضررها و انضباط در رعایت ریسک.

## روانشناسی معامله‌گر
الگوهای احساسی و انضباطی بر اساس داده‌های ثبت‌شده.

## برنامه‌ی بهبود
یک برنامه‌ی عملی و اولویت‌بندی‌شده (۳ تا ۵ مورد) برای بهبود در معاملات آینده.

به اعداد واقعی استناد کن، صادق و سازنده باش و از کلی‌گویی بپرهیز.
"""

_INSTITUTIONAL_SYSTEM_PROMPT = """\
تو یک تیم تحلیل نهادی متشکل از این نقش‌ها هستی:
- مدیر سبد دارایی کریپتوی نهادی (Institutional Crypto Portfolio Manager)
- مدیر ریسک صندوق پوشش ریسک کریپتو (Crypto Hedge Fund Risk Manager)
- تحلیل‌گر کمّی (Quantitative Analyst)
- ارزیاب پراپ تریدینگ (Prop Trading Evaluator)
- افسر دیلیجنس (Due Diligence Officer)

یک صورت‌حساب کامل معاملاتی به‌همراه «معیارهای محاسبه‌شده» (که در پایتون و دقیق محاسبه شده‌اند) و در صورت وجود، تصاویر چارت معاملات به تو داده می‌شود.
هدف: تعیین این‌که آیا این معامله‌گر یک «اج (edge) واقعی و مقیاس‌پذیر» دارد که برای موارد زیر مناسب باشد:
کپی‌تریدینگ، تخصیص سرمایه‌ی صندوق، سرمایه‌ی پراپ تریدینگ، و حساب‌های مدیریت‌شده.

یک گزارش کامل نهادی (Institutional-grade) به زبان فارسی و در قالب Markdown تولید کن. حتماً همه‌ی ۱۹ بخش زیر را با همین عناوین و ترتیب بیاور و در هر بخش از اعداد واقعیِ داده‌شده استفاده کن (نه حدس). جدول‌ها را با سینتکس جدول Markdown بساز.

## بخش ۱ — داشبورد اجرایی
امتیاز نهایی (۰ تا ۱۰۰)، درجه‌ی معامله‌گر (A+ تا F)، امتیاز ریسک، امتیاز اج، امتیاز ثبات، امتیاز مقیاس‌پذیری، امتیاز حفظ سرمایه، امتیاز مناسب‌بودن برای سرمایه‌گذار. خلاصه‌ی نقاط قوت، نقاط ضعف و توصیه‌ی تخصیص سرمایه.
## بخش ۲ — نمای کلی حساب
جدول: سرمایه‌ی اولیه، سرمایه‌ی نهایی، سود خالص، بازده خالص٪، بازه‌ی معاملاتی، تعداد معاملات، تعداد روزهای معاملاتی، میانگین معاملات در روز، وین‌ریت، فاکتور سود، فاکتور بازیابی (Recovery)، میانگین مدت معامله.
## بخش ۳ — تحلیل عملکرد
سود ناخالص، زیان ناخالص، سود خالص، میانگین برنده، میانگین بازنده، نسبت ریوارد/ریسک، بزرگ‌ترین برد، بزرگ‌ترین باخت، بیشترین بردهای متوالی، بیشترین باخت‌های متوالی. جدول‌های عملکرد روزانه، هفتگی و ماهانه.
## بخش ۴ — تحلیل اکسپوژر بازار کریپتو
درصد اکسپوژر BTC، ETH، آلت‌کوین، استیبل‌کوین. پرمعامله‌ترین، سودده‌ترین و کم‌سودترین دارایی‌ها (جدول رتبه‌بندی).
## بخش ۵ — تحلیل لانگ/شورت
درصد لانگ و شورت؛ برای هر سمت: وین‌ریت، فاکتور سود، میانگین بازده. آیا معامله‌گر سوگیری دارد؟ آیا اج فقط در یک سمت وجود دارد؟
## بخش ۶ — تحلیل اهرم
میانگین اهرم، حداکثر اهرم، اهرم مؤثر، ثبات اهرم. طبقه‌بندی: محافظه‌کار/متعادل/تهاجمی/افراطی.
## بخش ۷ — تحلیل ریسک لیکوئیدیشن
تخمین فاصله تا لیکوئید، احتمال لیکوئید، فشار مارجین و ارزیابی بقای حساب.
## بخش ۸ — تحلیل دراودان
دراودان مطلق، نسبی، حداکثری و دراودان اکوییتی؛ ارزیابی کیفیت بازیابی.
## بخش ۹ — ممیزی مدیریت ریسک
اندازه‌ی پوزیشن، ریسک هر معامله، استفاده از حد ضرر، مدیریت اکسپوژر. شناسایی مارتینگل، میانگین‌گیری در ضرر، گرید، و اهرم بیش‌ازحد — همراه با شواهد.
## بخش ۱۰ — تحلیل رفتاری
انضباط، FOMO، معاملات انتقامی، اعتمادبه‌نفس کاذب، ثبات احساسی — به هر مورد امتیاز بده.
## بخش ۱۱ — تشخیص اج (Edge)
آیا سودآوری از آلفای واقعی است یا بتای بازار / شرایط بازار صعودی / شانس؟ پایداری را ارزیابی کن.
## بخش ۱۲ — تحلیل رژیم بازار
عملکرد احتمالی در بازار صعودی، نزولی، خنثی، نوسان بالا و نوسان پایین.
## بخش ۱۳ — تحلیل همبستگی با BTC
میزان وابستگی عملکرد به روند BTC. اگر BTC ۳۰٪ بریزد، آیا استراتژی سودده می‌ماند؟
## بخش ۱۴ — شبیه‌سازی مونت‌کارلو
نتایج مونت‌کارلوی محاسبه‌شده (که در داده‌ها آمده) را تفسیر کن: دراودان آینده، ریسک ورشکستگی (Risk of Ruin)، احتمال زیان ۲۰٪ و احتمال زیان ۵۰٪.
## بخش ۱۵ — تست استرس
تحت سناریوهای BTC -۳۰٪، BTC -۵۰٪، نوسان ×۲، اسلیپیج ×۳، و وین‌ریت -۲۰٪ بقای حساب را ارزیابی کن.
## بخش ۱۶ — مناسب‌بودن برای کپی‌تریدینگ
امتیاز جداگانه برای کپی‌تریدینگ، PAMM، حساب مدیریت‌شده و تخصیص صندوق.
## بخش ۱۷ — تحلیل مقیاس‌پذیری سرمایه
مقیاس‌پذیری به ۱۰k، ۵۰k، ۱۰۰k، ۵۰۰k و ۱M دلار؛ ریسک نقدشوندگی، اسلیپیج و اجرا.
## بخش ۱۸ — کارت امتیاز نهادی
امتیاز: سودآوری، ثبات، کنترل ریسک، انضباط رفتاری، کنترل دراودان، مقیاس‌پذیری، مناسب‌بودن برای سرمایه‌گذار. سپس امتیاز نهاییِ وزن‌دهی‌شده.
## بخش ۱۹ — تصمیم نهایی کمیته‌ی سرمایه‌گذاری
یکی را انتخاب کن: A+ (نهادی)، A (حرفه‌ای)، B (قوی)، C (متوسط)، D (پرریسک)، F (غیرقابل‌سرمایه‌گذاری) — با توضیح کامل.

قواعد مهم:
- فقط از اعداد واقعیِ ارائه‌شده استفاده کن؛ هیچ عددی را از خودت نساز. اگر داده‌ای موجود نیست، صریحاً بنویس «داده کافی نیست».
- مفروضات و نحوه‌ی محاسبه را در هر بخش که لازم است شفاف بیان کن.
- لحن کاملاً حرفه‌ای و بی‌طرف (سبک هج‌فاند) باشد. سخت‌گیر و واقع‌بین باش؛ اغراق نکن.
"""


# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------
def _api_key() -> str:
    return settings.AI_API_KEY or settings.ANTHROPIC_API_KEY


def is_enabled() -> bool:
    """True when the AI feature can actually run (an API key is configured)."""
    return bool(_api_key())


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------
def _fmt(value: object, suffix: str = "") -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, bool):
        return ("بله" if value else "خیر") + suffix
    if isinstance(value, float):
        text = f"{value:.4f}".rstrip("0").rstrip(".")
        return f"{text}{suffix}"
    return f"{value}{suffix}"


def _image_data(url: str | None) -> tuple[str, str] | None:
    """Read an uploaded image off disk; return ``(media_type, base64)``."""
    if not url:
        return None
    name = os.path.basename(url)
    path = os.path.join(settings.UPLOAD_DIR, name)
    if not os.path.isfile(path):
        return None
    media = _MEDIA_TYPES.get(os.path.splitext(path)[1].lower())
    if not media:
        return None
    try:
        with open(path, "rb") as fh:
            data = base64.standard_b64encode(fh.read()).decode("ascii")
    except OSError:
        return None
    if len(data) > _MAX_IMAGE_B64:
        return None
    return media, data


def _checklist_summary(ticks: dict | None) -> str:
    if not isinstance(ticks, dict) or not ticks:
        return "ثبت نشده"
    total = len(ticks)
    done = sum(1 for v in ticks.values() if v)
    missed = [str(k) for k, v in ticks.items() if not v]
    out = f"{done} از {total} مورد رعایت شده"
    if missed:
        out += " — رعایت‌نشده: " + "، ".join(missed[:8])
    return out


def _emotions_summary(emotions: dict | None) -> str:
    if not isinstance(emotions, dict) or not emotions:
        return "ثبت نشده"
    parts = [f"{k}: {v}" for k, v in emotions.items() if v not in (None, "", False)]
    return "، ".join(parts) if parts else "ثبت نشده"


# ---------------------------------------------------------------------------
# Context builders
# ---------------------------------------------------------------------------
def build_trade_summary(
    user: User,
    all_trades: list[Trade],
    trade: Trade,
    transactions: list[WalletTransaction] | None,
) -> str:
    calc = balances.compute_for_trade(user, all_trades, trade, transactions)

    tp_lines = "\n".join(
        f"  - TP{tp.order}: قیمت {_fmt(tp.price)} | ذخیره {_fmt(tp.save_percent, '٪')}"
        for tp in trade.take_profits
    ) or "  بدون حد سود"

    if trade.entry_levels:
        entry_lines = "\n".join(
            f"  - پله {lvl.get('order')}: قیمت {_fmt(lvl.get('price'))} | "
            f"مارجین {_fmt(lvl.get('margin_percent'), '٪')}"
            for lvl in trade.entry_levels
        )
        entry_block = f"ورود پله‌ای:\n{entry_lines}\nمیانگین ورود: {_fmt(trade.entry_price)}"
    else:
        entry_block = f"قیمت ورود: {_fmt(trade.entry_price)}"

    lines = [
        f"# معامله شماره {trade.number}",
        f"نماد: {_fmt(trade.symbol)} | جهت: {_fmt(trade.direction)} | وضعیت: {_fmt(trade.status)}",
        f"تایم‌فریم تحلیل: {_fmt(trade.analysis_tf)} | تایم‌فریم تریگر: {_fmt(trade.trigger_tf)}",
        "",
        "## ورود و خروج",
        entry_block,
        f"اهرم (لوریج): {_fmt(trade.leverage)} | درصد مارجین: {_fmt(trade.margin_percent, '٪')}",
        f"حد ضرر: {_fmt(trade.stop_loss)}",
        "حد سودها:",
        tp_lines,
        f"نوع خروج: {_fmt(trade.exit_type)} | قیمت خروج: {_fmt(trade.exit_price)}",
        f"تاریخ ورود: {_fmt(trade.open_date)} | تاریخ خروج: {_fmt(trade.close_date)}",
        f"بدون‌ریسک‌شده (مدیریت): {_fmt(trade.is_risk_free_mgmt)}",
        "",
        "## نتایج محاسبه‌شده",
        f"موجودی پایه (snapshot): {_fmt(trade.balance_snapshot)}",
        f"مارجین: {_fmt(calc.get('margin'))} | حجم پوزیشن: {_fmt(calc.get('positionSize'))}",
        f"ریسک به ریوارد مورد انتظار: {_fmt(calc.get('rrExpected'))} | "
        f"کسب‌شده: {_fmt(calc.get('rrAchieved'))}",
        f"سود/زیان تحقق‌یافته: {_fmt(calc.get('realizedPnl'), ' دلار')}",
        f"درصد نتیجه: {_fmt(calc.get('resultPct'), '٪')} | "
        f"درصد رشد سرمایه: {_fmt(calc.get('capitalPct'), '٪')}",
        f"سشن معاملاتی: {_fmt(calc.get('session'))}",
        "",
        "## روانشناسی و انضباط",
        f"احساسات: {_emotions_summary(trade.emotions)}",
        f"چک‌لیست: {_checklist_summary(trade.checklist_ticks)}",
        f"دلایل ورود: {('، '.join(trade.entry_reasons) if trade.entry_reasons else '—')}",
        f"دلایل خروج: {('، '.join(trade.exit_reasons) if trade.exit_reasons else '—')}",
        f"برچسب‌ها: {('، '.join(trade.tags) if trade.tags else '—')}",
        "",
        "## یادداشت‌ها",
        f"یادداشت ورود: {_fmt(trade.entry_note)}",
        f"یادداشت خروج: {_fmt(trade.exit_note)}",
        f"یادداشت کلی: {_fmt(trade.general_note)}",
    ]
    return "\n".join(lines)


def build_overall_summary(
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None,
) -> str:
    closed = [
        t for t in trades
        if t.status == "CLOSED" and not getattr(t, "is_locked", False)
    ]
    closed.sort(key=lambda t: t.number)

    pnls: list[float] = []
    rrs: list[float] = []
    wins = losses = breakeven = 0
    sym_pnl: dict[str, float] = {}
    rows: list[str] = []

    for t in closed:
        calc = balances.compute_for_trade(user, trades, t, transactions)
        pnl = calc.get("realizedPnl") or 0.0
        pnls.append(pnl)
        rr = calc.get("rrAchieved")
        if rr is not None:
            rrs.append(rr)
        if pnl > 0:
            wins += 1
        elif pnl < 0:
            losses += 1
        else:
            breakeven += 1
        sym = t.symbol or "?"
        sym_pnl[sym] = sym_pnl.get(sym, 0.0) + pnl
        rows.append(
            f"  #{t.number} | {_fmt(t.symbol)} | {_fmt(t.direction)} | "
            f"R:R {_fmt(calc.get('rrAchieved'))} | "
            f"PnL {_fmt(pnl, ' دلار')} | نتیجه {_fmt(calc.get('resultPct'), '٪')} | "
            f"چک‌لیست: {_checklist_summary(t.checklist_ticks)} | "
            f"احساسات: {_emotions_summary(t.emotions)}"
        )

    n = len(closed)
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = sum(-p for p in pnls if p < 0)
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else None
    win_rate = (wins / n * 100) if n else None
    avg_rr = (sum(rrs) / len(rrs)) if rrs else None
    total_pnl = sum(pnls)

    best = sorted(sym_pnl.items(), key=lambda kv: kv[1], reverse=True)
    sym_lines = "\n".join(f"  - {s}: {_fmt(p, ' دلار')}" for s, p in best[:8]) or "  —"

    current = balances.current_balance(user, trades, transactions)

    # Keep the trade list bounded so the prompt stays within reasonable limits.
    if len(rows) > 60:
        rows = rows[-60:]
        rows.insert(0, "  (فقط ۶۰ معامله‌ی آخر نمایش داده شده)")

    header = [
        f"# کارنامه معاملاتی {_fmt(user.first_name)} {_fmt(user.last_name)}",
        "",
        "## آمار کلی (معاملات بسته‌شده و قفل‌نشده)",
        f"تعداد معاملات بسته‌شده: {n}",
        f"برد/باخت/سربه‌سر: {wins} / {losses} / {breakeven}",
        f"وین‌ریت: {_fmt(win_rate, '٪')}",
        f"فاکتور سود (Profit Factor): {_fmt(profit_factor) if profit_factor is not None else 'بدون ضرر'}",
        f"میانگین ریسک به ریوارد کسب‌شده: {_fmt(avg_rr)}",
        f"سود/زیان خالص: {_fmt(total_pnl, ' دلار')}",
        f"موجودی فعلی: {_fmt(current, ' دلار')} | موجودی اولیه: {_fmt(user.wallet_margin, ' دلار')}",
        "",
        "## سود/زیان به تفکیک نماد",
        sym_lines,
        "",
        "## فهرست معاملات",
        *rows,
    ]
    return "\n".join(header)


# ---------------------------------------------------------------------------
# Institutional report: deterministic metrics + Monte Carlo
# ---------------------------------------------------------------------------
_STABLES = {"USDT", "USDC", "DAI", "TUSD", "BUSD", "FDUSD", "USDE"}


def _base_asset(symbol: str | None) -> str:
    """Best-effort base asset from a pair like ``BTCUSDT`` / ``ETH/USDT``."""
    if not symbol:
        return "?"
    s = symbol.upper().replace("/", "").replace("-", "").replace("_", "")
    for quote in ("USDT", "USDC", "USD", "BUSD", "PERP"):
        if s.endswith(quote) and len(s) > len(quote):
            return s[: -len(quote)]
    return s


def _asset_class(symbol: str | None) -> str:
    base = _base_asset(symbol)
    if base in ("BTC", "XBT"):
        return "BTC"
    if base == "ETH":
        return "ETH"
    if base in _STABLES:
        return "STABLE"
    return "ALT"


def _max_drawdown(equity: list[float]) -> tuple[float, float]:
    """Return ``(absolute_dd, relative_dd_pct)`` over an equity series."""
    peak = equity[0] if equity else 0.0
    max_abs = 0.0
    max_rel = 0.0
    for v in equity:
        if v > peak:
            peak = v
        dd = peak - v
        if dd > max_abs:
            max_abs = dd
        if peak > 0 and (dd / peak) * 100 > max_rel:
            max_rel = (dd / peak) * 100
    return max_abs, max_rel


def _streaks(signs: list[int]) -> tuple[int, int]:
    """Longest run of wins (+1) and losses (-1)."""
    best_w = best_l = cur_w = cur_l = 0
    for s in signs:
        if s > 0:
            cur_w += 1
            cur_l = 0
        elif s < 0:
            cur_l += 1
            cur_w = 0
        else:
            cur_w = cur_l = 0
        best_w = max(best_w, cur_w)
        best_l = max(best_l, cur_l)
    return best_w, best_l


def _monte_carlo(
    returns: list[float],
    start_equity: float,
    runs: int = 5000,
) -> dict:
    """Bootstrap Monte Carlo on per-trade fractional returns.

    ``returns`` are per-trade results as a fraction of equity at the time of the
    trade (e.g. +0.03 = +3%). Each simulated path resamples the same number of
    trades with replacement and compounds them. Ruin = equity touches <= 10% of
    the start at any point in the path.
    """
    n = len(returns)
    if n == 0 or start_equity <= 0:
        return {}
    ruin = 0
    loss20 = loss50 = 0
    final_returns: list[float] = []
    max_dds: list[float] = []
    ruin_floor = start_equity * 0.10
    for _ in range(runs):
        eq = start_equity
        peak = start_equity
        path_dd = 0.0
        ruined = False
        for _ in range(n):
            eq *= 1.0 + random.choice(returns)
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak * 100 if peak > 0 else 0.0
            path_dd = max(path_dd, dd)
            if eq <= ruin_floor:
                ruined = True
        final_ret = (eq - start_equity) / start_equity * 100
        final_returns.append(final_ret)
        max_dds.append(path_dd)
        if ruined:
            ruin += 1
        if final_ret <= -20:
            loss20 += 1
        if final_ret <= -50:
            loss50 += 1
    final_returns.sort()
    max_dds.sort()

    def _pct(sorted_list: list[float], q: float) -> float:
        if not sorted_list:
            return 0.0
        idx = min(len(sorted_list) - 1, max(0, int(q * len(sorted_list))))
        return sorted_list[idx]

    return {
        "runs": runs,
        "risk_of_ruin_pct": ruin / runs * 100,
        "prob_loss_20_pct": loss20 / runs * 100,
        "prob_loss_50_pct": loss50 / runs * 100,
        "median_final_return_pct": _pct(final_returns, 0.50),
        "p05_final_return_pct": _pct(final_returns, 0.05),
        "p95_final_return_pct": _pct(final_returns, 0.95),
        "median_max_drawdown_pct": _pct(max_dds, 0.50),
        "p95_max_drawdown_pct": _pct(max_dds, 0.95),
    }


def build_institutional_summary(
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None,
) -> str:
    closed = [
        t for t in trades
        if t.status == "CLOSED" and not getattr(t, "is_locked", False)
    ]
    closed.sort(key=lambda t: t.number)

    start_equity = user.wallet_margin or 0.0
    equity = start_equity
    equity_curve = [start_equity]
    pnls: list[float] = []
    returns_frac: list[float] = []   # pnl / equity-before-trade
    rrs: list[float] = []
    signs: list[int] = []
    durations_h: list[float] = []
    leverages: list[float] = []
    class_count: dict[str, int] = {}
    class_pnl: dict[str, float] = {}
    sym_pnl: dict[str, float] = {}
    sym_count: dict[str, int] = {}
    long_pnls: list[float] = []
    short_pnls: list[float] = []
    monthly: dict[str, float] = {}
    largest_win = 0.0
    largest_loss = 0.0
    days: set[str] = set()

    for t in closed:
        calc = balances.compute_for_trade(user, trades, t, transactions)
        pnl = calc.get("realizedPnl") or 0.0
        base_eq = equity if equity > 0 else (start_equity or 1.0)
        returns_frac.append(pnl / base_eq if base_eq else 0.0)
        equity += pnl
        equity_curve.append(equity)
        pnls.append(pnl)
        rr = calc.get("rrAchieved")
        if rr is not None:
            rrs.append(rr)
        signs.append(1 if pnl > 0 else (-1 if pnl < 0 else 0))
        largest_win = max(largest_win, pnl)
        largest_loss = min(largest_loss, pnl)
        if t.leverage:
            leverages.append(t.leverage)

        cls = _asset_class(t.symbol)
        class_count[cls] = class_count.get(cls, 0) + 1
        class_pnl[cls] = class_pnl.get(cls, 0.0) + pnl
        sym = t.symbol or "?"
        sym_pnl[sym] = sym_pnl.get(sym, 0.0) + pnl
        sym_count[sym] = sym_count.get(sym, 0) + 1

        if t.direction == "SHORT":
            short_pnls.append(pnl)
        else:
            long_pnls.append(pnl)

        d = t.close_date or t.open_date
        if d:
            days.add(d.date().isoformat())
            monthly[d.strftime("%Y-%m")] = monthly.get(d.strftime("%Y-%m"), 0.0) + pnl
        if t.open_date and t.close_date:
            durations_h.append((t.close_date - t.open_date).total_seconds() / 3600.0)

    n = len(closed)
    end_equity = equity
    net_profit = end_equity - start_equity
    net_return = (net_profit / start_equity * 100) if start_equity else 0.0
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = sum(-p for p in pnls if p < 0)
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else None
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    win_rate = (len(wins) / n * 100) if n else 0.0
    avg_win = (sum(wins) / len(wins)) if wins else 0.0
    avg_loss = (sum(losses) / len(losses)) if losses else 0.0
    reward_risk = (avg_win / abs(avg_loss)) if avg_loss else None
    abs_dd, rel_dd = _max_drawdown(equity_curve)
    recovery_factor = (net_profit / abs_dd) if abs_dd > 0 else None
    best_w, best_l = _streaks(signs)
    avg_dur = (sum(durations_h) / len(durations_h)) if durations_h else None
    avg_lev = (sum(leverages) / len(leverages)) if leverages else None
    max_lev = max(leverages) if leverages else None

    def _side_stats(side_pnls: list[float]) -> str:
        if not side_pnls:
            return "بدون معامله"
        w = [p for p in side_pnls if p > 0]
        gl = sum(-p for p in side_pnls if p < 0)
        gp = sum(p for p in side_pnls if p > 0)
        pf = (gp / gl) if gl > 0 else float("inf")
        wr = len(w) / len(side_pnls) * 100
        avg = sum(side_pnls) / len(side_pnls)
        pf_txt = "∞" if pf == float("inf") else _fmt(pf)
        return (
            f"تعداد {len(side_pnls)} | وین‌ریت {_fmt(wr, '٪')} | "
            f"فاکتور سود {pf_txt} | میانگین بازده {_fmt(avg, ' دلار')}"
        )

    total_class = sum(class_count.values()) or 1
    exposure_lines = "\n".join(
        f"  - {cls}: {_fmt(c / total_class * 100, '٪')} از معاملات | "
        f"سود خالص {_fmt(class_pnl.get(cls, 0.0), ' دلار')}"
        for cls, c in sorted(class_count.items(), key=lambda kv: kv[1], reverse=True)
    ) or "  —"

    by_pnl = sorted(sym_pnl.items(), key=lambda kv: kv[1], reverse=True)
    most_traded = sorted(sym_count.items(), key=lambda kv: kv[1], reverse=True)[:5]
    top_lines = "\n".join(
        f"  - {s}: {_fmt(p, ' دلار')} ({sym_count.get(s, 0)} معامله)" for s, p in by_pnl[:5]
    ) or "  —"
    worst_lines = "\n".join(
        f"  - {s}: {_fmt(p, ' دلار')} ({sym_count.get(s, 0)} معامله)"
        for s, p in by_pnl[-5:][::-1]
    ) or "  —"
    traded_lines = "\n".join(f"  - {s}: {c} معامله" for s, c in most_traded) or "  —"

    monthly_lines = "\n".join(
        f"  - {m}: {_fmt(v, ' دلار')}" for m, v in sorted(monthly.items())
    ) or "  —"

    mc = _monte_carlo(returns_frac, start_equity or 1000.0, runs=5000)
    if mc:
        mc_lines = "\n".join([
            f"  تعداد شبیه‌سازی: {mc['runs']}",
            f"  ریسک ورشکستگی (افت تا ۱۰٪ سرمایه): {_fmt(mc['risk_of_ruin_pct'], '٪')}",
            f"  احتمال زیان ≥۲۰٪: {_fmt(mc['prob_loss_20_pct'], '٪')}",
            f"  احتمال زیان ≥۵۰٪: {_fmt(mc['prob_loss_50_pct'], '٪')}",
            f"  بازده نهایی میانه: {_fmt(mc['median_final_return_pct'], '٪')} "
            f"(بازه ۵٪–۹۵٪: {_fmt(mc['p05_final_return_pct'], '٪')} تا {_fmt(mc['p95_final_return_pct'], '٪')})",
            f"  دراودان حداکثری میانه: {_fmt(mc['median_max_drawdown_pct'], '٪')} "
            f"(صدک ۹۵: {_fmt(mc['p95_max_drawdown_pct'], '٪')})",
        ])
    else:
        mc_lines = "  داده کافی برای شبیه‌سازی نیست"

    period = "—"
    open_dates = [t.open_date for t in closed if t.open_date]
    close_dates = [t.close_date or t.open_date for t in closed if (t.close_date or t.open_date)]
    if open_dates and close_dates:
        period = f"{min(open_dates).date().isoformat()} تا {max(close_dates).date().isoformat()}"
    n_days = len(days)
    avg_trades_day = (n / n_days) if n_days else 0.0

    lines = [
        f"# صورت‌حساب معاملاتی — {_fmt(user.first_name)} {_fmt(user.last_name)} "
        f"(@{_fmt(user.username)})",
        "",
        "## معیارهای محاسبه‌شده (دقیق، در پایتون)",
        f"سرمایه‌ی اولیه: {_fmt(start_equity, ' دلار')}",
        f"سرمایه‌ی نهایی: {_fmt(end_equity, ' دلار')}",
        f"سود خالص: {_fmt(net_profit, ' دلار')} | بازده خالص: {_fmt(net_return, '٪')}",
        f"بازه‌ی معاملاتی: {period}",
        f"تعداد معاملات بسته‌شده: {n} | روزهای معاملاتی: {n_days} | "
        f"میانگین معامله در روز: {_fmt(avg_trades_day)}",
        f"وین‌ریت: {_fmt(win_rate, '٪')} | "
        f"فاکتور سود: {_fmt(profit_factor) if profit_factor is not None else 'بدون ضرر'}",
        f"فاکتور بازیابی (Recovery): {_fmt(recovery_factor) if recovery_factor is not None else '—'}",
        f"میانگین مدت معامله (ساعت): {_fmt(avg_dur) if avg_dur is not None else '—'}",
        "",
        "## عملکرد",
        f"سود ناخالص: {_fmt(gross_profit, ' دلار')} | زیان ناخالص: {_fmt(gross_loss, ' دلار')}",
        f"میانگین برنده: {_fmt(avg_win, ' دلار')} | میانگین بازنده: {_fmt(avg_loss, ' دلار')}",
        f"نسبت ریوارد/ریسک: {_fmt(reward_risk) if reward_risk is not None else '—'} | "
        f"میانگین R:R کسب‌شده: {_fmt((sum(rrs) / len(rrs)) if rrs else None)}",
        f"بزرگ‌ترین برد: {_fmt(largest_win, ' دلار')} | بزرگ‌ترین باخت: {_fmt(largest_loss, ' دلار')}",
        f"بیشترین بردهای متوالی: {best_w} | بیشترین باخت‌های متوالی: {best_l}",
        "",
        "## دراودان",
        f"دراودان مطلق (حداکثر افت دلاری): {_fmt(abs_dd, ' دلار')}",
        f"دراودان نسبی (حداکثری٪): {_fmt(rel_dd, '٪')}",
        "",
        "## اکسپوژر بازار (بر اساس تعداد معاملات)",
        exposure_lines,
        "",
        "## سودده‌ترین دارایی‌ها",
        top_lines,
        "## کم‌سودترین/زیان‌ده‌ترین دارایی‌ها",
        worst_lines,
        "## پرمعامله‌ترین دارایی‌ها",
        traded_lines,
        "",
        "## لانگ/شورت",
        f"لانگ: {len(long_pnls)} معامله ({_fmt(len(long_pnls) / n * 100 if n else 0, '٪')}) — {_side_stats(long_pnls)}",
        f"شورت: {len(short_pnls)} معامله ({_fmt(len(short_pnls) / n * 100 if n else 0, '٪')}) — {_side_stats(short_pnls)}",
        "",
        "## اهرم",
        f"میانگین اهرم: {_fmt(avg_lev) if avg_lev is not None else '—'} | "
        f"حداکثر اهرم: {_fmt(max_lev) if max_lev is not None else '—'}",
        "",
        "## عملکرد ماهانه",
        monthly_lines,
        "",
        "## شبیه‌سازی مونت‌کارلو (بوت‌استرپ روی بازده‌ی واقعی معاملات)",
        mc_lines,
        "",
        "## اکوییتی (دنباله‌ی موجودی پس از هر معامله)",
        "  " + "، ".join(_fmt(v) for v in equity_curve[:120]) + (" …" if len(equity_curve) > 120 else ""),
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Transport (httpx) — OpenAI-compatible or Anthropic-compatible
# ---------------------------------------------------------------------------
async def _complete(
    system: str,
    user_text: str,
    images: list[tuple[str, str, str]] | None = None,
    max_tokens: int | None = None,
) -> str:
    """Send a single-turn request and return the assistant's text.

    ``images`` items are ``(label, media_type, base64)`` tuples.
    """
    key = _api_key()
    if not key:
        raise AINotConfigured(
            "تحلیل هوش مصنوعی فعال نیست. کلید API در سرور تنظیم نشده است."
        )
    images = images or []
    tokens = max_tokens or settings.AI_MAX_TOKENS
    style = (settings.AI_API_STYLE or "openai").strip().lower()

    if style == "anthropic":
        url, headers, payload = _anthropic_request(key, system, user_text, images, tokens)
    else:
        url, headers, payload = _openai_request(key, system, user_text, images, tokens)

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise AIRequestError(f"خطا در ارتباط با سرویس هوش مصنوعی: {exc}") from exc

    if resp.status_code >= 400:
        snippet = resp.text[:300]
        raise AIRequestError(
            f"سرویس هوش مصنوعی خطا برگرداند ({resp.status_code}): {snippet}"
        )

    try:
        data = resp.json()
    except ValueError as exc:
        raise AIRequestError("پاسخ نامعتبر از سرویس هوش مصنوعی دریافت شد.") from exc

    text = _anthropic_text(data) if style == "anthropic" else _openai_text(data)
    if not text:
        raise AIRequestError("پاسخ خالی از سرویس هوش مصنوعی دریافت شد.")
    return text


def _openai_request(key, system, user_text, images, max_tokens):
    base = (settings.AI_BASE_URL or "").rstrip("/")
    if not base:
        raise AINotConfigured("AI_BASE_URL برای حالت openai تنظیم نشده است.")
    if images:
        content: list[dict] = [{"type": "text", "text": user_text}]
        for label, media, b64 in images:
            content.append({"type": "text", "text": label})
            content.append(
                {"type": "image_url", "image_url": {"url": f"data:{media};base64,{b64}"}}
            )
        user_content: object = content
    else:
        user_content = user_text
    payload = {
        "model": settings.AI_MODEL,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
    }
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    return f"{base}/chat/completions", headers, payload


def _anthropic_request(key, system, user_text, images, max_tokens):
    base = (settings.AI_BASE_URL or "https://api.anthropic.com").rstrip("/")
    content: list[dict] = [{"type": "text", "text": user_text}]
    for label, media, b64 in images:
        content.append({"type": "text", "text": label})
        content.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": media, "data": b64},
            }
        )
    payload = {
        "model": settings.AI_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": content}],
    }
    headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    return f"{base}/v1/messages", headers, payload


def _openai_text(data: dict) -> str:
    try:
        return (data["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError, TypeError):
        return ""


def _anthropic_text(data: dict) -> str:
    blocks = data.get("content") or []
    parts = [b.get("text", "") for b in blocks if b.get("type") == "text"]
    return "\n".join(parts).strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
async def analyze_trade(
    user: User,
    all_trades: list[Trade],
    trade: Trade,
    transactions: list[WalletTransaction] | None,
) -> str:
    summary = build_trade_summary(user, all_trades, trade, transactions)

    images: list[tuple[str, str, str]] = []
    for label, url in (
        ("تصویر چارت قبل از ورود:", trade.image_before),
        ("تصویر چارت بعد از خروج:", trade.image_after),
    ):
        data = _image_data(url)
        if data:
            images.append((label, data[0], data[1]))

    return await _complete(_TRADE_SYSTEM_PROMPT, summary, images)


async def analyze_overall(
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None,
) -> str:
    summary = build_overall_summary(user, trades, transactions)
    return await _complete(_OVERALL_SYSTEM_PROMPT, summary)


# Vision is token-heavy; cap how many chart images the institutional report sends.
_REPORT_IMAGE_CAP = 12


async def analyze_institutional(
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None,
) -> str:
    summary = build_institutional_summary(user, trades, transactions)

    # Attach chart screenshots from the most recent trades (capped), so the model
    # can audit setups without blowing past vision/token limits.
    images: list[tuple[str, str, str]] = []
    closed = [
        t for t in trades
        if t.status == "CLOSED" and not getattr(t, "is_locked", False)
    ]
    closed.sort(key=lambda t: t.number, reverse=True)
    for t in closed:
        for label, url in (
            (f"معامله #{t.number} {t.symbol or ''} — چارت قبل:", t.image_before),
            (f"معامله #{t.number} {t.symbol or ''} — چارت بعد:", t.image_after),
        ):
            if len(images) >= _REPORT_IMAGE_CAP:
                break
            data = _image_data(url)
            if data:
                images.append((label, data[0], data[1]))
        if len(images) >= _REPORT_IMAGE_CAP:
            break

    return await _complete(
        _INSTITUTIONAL_SYSTEM_PROMPT,
        summary,
        images,
        max_tokens=settings.AI_REPORT_MAX_TOKENS,
    )
