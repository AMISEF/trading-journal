"""AI trading coach powered by Claude (Anthropic), with chart-image vision.

Builds a rich Persian context from every recorded field of a trade (entry,
exits, take-profits, risk/reward, realised PnL, emotions, checklist, reasons,
notes and the before/after chart screenshots) and asks Claude to act as a
professional trading coach. Two entry points:

* :func:`analyze_trade`   – deep review of a single trade.
* :func:`analyze_overall` – coaching report across the whole journal
  (win-rate, profit factor, recurring mistakes, psychology, risk management).

The feature is inert until ``ANTHROPIC_API_KEY`` is configured; callers should
catch :class:`AINotConfigured` and surface a friendly message.
"""

from __future__ import annotations

import base64
import os

from app.core.config import settings
from app.models.trade import Trade
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.services import balances

try:  # The dependency may not be installed in minimal environments.
    from anthropic import AsyncAnthropic
except ImportError:  # pragma: no cover - import guard
    AsyncAnthropic = None  # type: ignore[assignment]


class AINotConfigured(Exception):
    """Raised when the AI feature is requested but not configured/installed."""


class AIRequestError(Exception):
    """Raised when the upstream AI request fails."""


_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}

# Roughly 5 MB of raw bytes -> base64; skip anything larger to stay within the
# API's per-image limits.
_MAX_IMAGE_B64 = 7_000_000

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


# ---------------------------------------------------------------------------
# Configuration / client helpers
# ---------------------------------------------------------------------------
def is_enabled() -> bool:
    """True when the AI feature can actually run (lib installed + key present)."""
    return AsyncAnthropic is not None and bool(settings.ANTHROPIC_API_KEY)


def _client() -> "AsyncAnthropic":
    if AsyncAnthropic is None:
        raise AINotConfigured("کتابخانه anthropic روی سرور نصب نشده است.")
    if not settings.ANTHROPIC_API_KEY:
        raise AINotConfigured(
            "تحلیل هوش مصنوعی فعال نیست. کلید ANTHROPIC_API_KEY در سرور تنظیم نشده است."
        )
    return AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


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


def _image_block(url: str | None) -> dict | None:
    """Read an uploaded image off disk and turn it into a Claude image block."""
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
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media, "data": data},
    }


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
# Public API
# ---------------------------------------------------------------------------
def _text_from(message) -> str:
    parts = [
        block.text
        for block in message.content
        if getattr(block, "type", None) == "text"
    ]
    text = "\n".join(parts).strip()
    if not text:
        raise AIRequestError("پاسخ خالی از سرویس هوش مصنوعی دریافت شد.")
    return text


async def analyze_trade(
    user: User,
    all_trades: list[Trade],
    trade: Trade,
    transactions: list[WalletTransaction] | None,
) -> str:
    client = _client()
    summary = build_trade_summary(user, all_trades, trade, transactions)

    content: list[dict] = [{"type": "text", "text": summary}]
    for label, url in (
        ("تصویر چارت قبل از ورود:", trade.image_before),
        ("تصویر چارت بعد از خروج:", trade.image_after),
    ):
        block = _image_block(url)
        if block:
            content.append({"type": "text", "text": label})
            content.append(block)

    try:
        message = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=settings.AI_MAX_TOKENS,
            system=_TRADE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
        )
    except Exception as exc:  # noqa: BLE001 - surface upstream failure cleanly
        raise AIRequestError(f"خطا در ارتباط با سرویس هوش مصنوعی: {exc}") from exc
    return _text_from(message)


async def analyze_overall(
    user: User,
    trades: list[Trade],
    transactions: list[WalletTransaction] | None,
) -> str:
    client = _client()
    summary = build_overall_summary(user, trades, transactions)

    try:
        message = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=settings.AI_MAX_TOKENS,
            system=_OVERALL_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": [{"type": "text", "text": summary}]}],
        )
    except Exception as exc:  # noqa: BLE001
        raise AIRequestError(f"خطا در ارتباط با سرویس هوش مصنوعی: {exc}") from exc
    return _text_from(message)
