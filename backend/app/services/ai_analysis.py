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
import json
import os
import random

import httpx

from app.core.config import settings
from app.models.trade import Trade
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.services import balances
from app.services.sessions import session_for


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
تو یک مربی حرفه‌ای معامله‌گری (Trading Coach) هستی. کارنامه‌ی کامل یک معامله‌گر کریپتو شامل آمار کلی و
فهرست تک‌تک معاملات (با دلایل ورود و خروج، سبک، احساسات، ریسک به ریوارد و نتیجه) به تو داده می‌شود.

‼️ بسیار مهم: کوتاه، دقیق و کاربردی بنویس. از پرگویی و توضیح اضافی به‌شدت پرهیز کن. تا جای ممکن از
جدول و فهرست (bullet) استفاده کن، نه پاراگراف‌های طولانی. هدف نهایی، توصیه‌های عملی برای افزایش
وین‌ریت و سود کاربر است. فقط به اعداد و داده‌های واقعی استناد کن؛ اگر داده‌ای نیست بنویس «داده کافی نیست».

خروجی را به فارسی و در قالب Markdown دقیقاً با همین ۹ بخش و ترتیب بده:

## ۱) امتیاز هر معامله
یک جدول واحد برای همه‌ی معاملات با این ستون‌ها بساز:
| # | نماد | جهت | دلیل ورود | دلیل خروج | سبک | احساسات | R:R | امتیاز (۰–۱۰) | یادداشت |
به هر معامله یک امتیاز ۰ تا ۱۰ بده که ترکیبی از این معیارهاست: منطقی‌بودن دلیل ورود، پایبندی خروج به پلن (نه احساسی)،
اجرای درست سبک/ستاپ، کنترل احساسات، و کیفیت ریسک به ریوارد. ستون «یادداشت» حداکثر یک عبارت کوتاه باشد.

## ۲) تحلیل احساسات
الگوهای احساسی غالب (ترس، طمع، انتقام، اعتمادبه‌نفس کاذب، بی‌صبری و ...) و تأثیر مستقیمشان بر نتیجه.
مشخص کن کدام احساسات بیشترین ضرر را ساخته‌اند (با اشاره به شماره‌ی معاملات نمونه).

## ۳) نقاط قوت و ضعف
- **نقاط قوت کلی:** (بولت کوتاه)
- **نقاط ضعف کلی:** (بولت کوتاه)
- **ضعف‌های تکراری در معاملات:** با ذکر شماره‌ی معاملات نمونه.

## ۴) راهبرد اصلاح
۳ تا ۵ تغییر کلیدی و مشخص که کاربر باید در روش معامله‌گری‌اش اعمال کند (هر کدام یک جمله، عملی و قابل‌اندازه‌گیری).

## ۵) پلن اجرایی
یک چک‌لیست گام‌به‌گام و قابل‌اجرا در سه فاز: «قبل از ورود»، «حین معامله»، «بعد از خروج».

## ۶) ریسک به ریوارد و وین‌ریت
وضعیت فعلی R:R و وین‌ریت کاربر و رابطه‌شان؛ سپس حداقل R:R و وین‌ریت هدف برای سوددهی پایدار و پیشنهاد مشخص برای معاملات آینده.

## ۷) بهترین ارزها برای تمرکز
بر اساس عملکرد واقعی، یک جدول کوتاه: ارزهایی که کاربر روی آن‌ها سودده بوده (برای تمرکز/نقشه‌برداری) و ارزهایی که باید کم یا حذف کند.

## ۸) جمع‌بندی
۳ تا ۵ جمله‌ی کوتاه نتیجه‌گیری.

## ۹) مهم‌ترین توصیه‌ها برای معاملات بعدی
فهرست کوتاه و کاملاً عملی از کارهایی که کاربر در معاملات بعدی انجام دهد تا کیفیت معاملات، وین‌ریت و سودش بیشتر شود.
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
            f"مارجین {_fmt(lvl.get('margin_percent'), '٪')} | "
            f"فعال‌شده: {_fmt(lvl.get('is_activated'))}"
            for lvl in trade.entry_levels
        )
        entry_block = f"ورود پله‌ای (DCA):\n{entry_lines}\nمیانگین ورود (وزنی): {_fmt(trade.entry_price)}"
    else:
        entry_block = f"قیمت ورود: {_fmt(trade.entry_price)}"

    trail_block = (
        f"تریلینگ استاپ: {_fmt(trade.trail_exit_value)}"
        f"{' ٪' if trade.trail_is_percent else ' (مقدار مطلق)'}"
        if trade.trail_exit_value is not None
        else "تریلینگ استاپ: —"
    )

    has_before = bool(trade.image_before)
    has_after = bool(trade.image_after)
    if has_before or has_after:
        images_note = (
            f"تصویر چارت قبل از ورود: {'پیوست شده — در ادامه بررسی کن' if has_before else 'ندارد'} | "
            f"تصویر چارت بعد از خروج: {'پیوست شده — در ادامه بررسی کن' if has_after else 'ندارد'}"
        )
    else:
        images_note = "تصویر چارت: کاربر تصویری برای این معامله ثبت نکرده است."

    lines = [
        f"# معامله شماره {trade.number}",
        f"شماره‌ی معامله در بروکر/صرافی (Trade #): {_fmt(trade.trade_number)}",
        f"نماد: {_fmt(trade.symbol)} | جهت: {_fmt(trade.direction)} | وضعیت: {_fmt(trade.status)}",
        f"تایم‌فریم تحلیل: {_fmt(trade.analysis_tf)} | تایم‌فریم تریگر: {_fmt(trade.trigger_tf)}",
        images_note,
        "",
        "## ورود و خروج",
        entry_block,
        f"اهرم (لوریج): {_fmt(trade.leverage)} | درصد مارجین: {_fmt(trade.margin_percent, '٪')}",
        f"حد ضرر: {_fmt(trade.stop_loss)}",
        "حد سودها:",
        tp_lines,
        f"نوع خروج: {_fmt(trade.exit_type)} | قیمت خروج: {_fmt(trade.exit_price)}",
        trail_block,
        f"تاریخ ورود: {_fmt(trade.open_date)} | تاریخ خروج: {_fmt(trade.close_date)}",
        f"پلن بدون‌ریسک (در برنامه‌ریزی): {_fmt(trade.is_risk_free_plan)} | "
        f"بدون‌ریسک‌شده (در مدیریت واقعی): {_fmt(trade.is_risk_free_mgmt)}",
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
        f"برچسب‌ها/سبک: {('، '.join(trade.tags) if trade.tags else '—')}",
        "",
        "## یادداشت‌ها",
        f"یادداشت ورود: {_fmt(trade.entry_note)}",
        f"یادداشت خروج: {_fmt(trade.exit_note)}",
        f"یادداشت کلی: {_fmt(trade.general_note)}",
        "",
        f"(ثبت شده: {_fmt(trade.created_at)} | آخرین ویرایش: {_fmt(trade.updated_at)})",
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
    direction_count = {"LONG": 0, "SHORT": 0}
    sess_count: dict[str, int] = {}
    sess_pnl: dict[str, float] = {}
    checklist_fractions: list[float] = []
    equity_curve: list[float] = []
    rows: list[str] = []

    balance_running = user.wallet_margin or 0.0

    for t in closed:
        calc = balances.compute_for_trade(user, trades, t, transactions)
        pnl = calc.get("realizedPnl") or 0.0
        pnls.append(pnl)
        balance_running += pnl
        equity_curve.append(balance_running)
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

        if t.direction in direction_count:
            direction_count[t.direction] += 1
        s = session_for(t.open_date) or "نامشخص"
        sess_count[s] = sess_count.get(s, 0) + 1
        sess_pnl[s] = sess_pnl.get(s, 0.0) + pnl
        ticks = t.checklist_ticks or {}
        if isinstance(ticks, dict) and ticks:
            total_ticks = len(ticks)
            done_ticks = sum(1 for v in ticks.values() if v)
            if total_ticks:
                checklist_fractions.append(done_ticks / total_ticks)

        entry_r = "، ".join(t.entry_reasons) if t.entry_reasons else "—"
        exit_r = "، ".join(t.exit_reasons) if t.exit_reasons else "—"
        style = "، ".join(t.tags) if t.tags else "—"
        tf = "/".join(x for x in (t.analysis_tf, t.trigger_tf) if x) or "—"
        rows.append(
            f"  #{t.number} | {_fmt(t.symbol)} | {_fmt(t.direction)} | "
            f"دلیل ورود: {entry_r} | دلیل خروج: {exit_r} | "
            f"سبک: {style} (TF {tf}) | "
            f"احساسات: {_emotions_summary(t.emotions)} | "
            f"R:R مورد انتظار {_fmt(calc.get('rrExpected'))}/کسب‌شده {_fmt(calc.get('rrAchieved'))} | "
            f"نتیجه {_fmt(calc.get('resultPct'), '٪')} | PnL {_fmt(pnl, ' دلار')} | "
            f"چک‌لیست: {_checklist_summary(t.checklist_ticks)}"
        )

    n = len(closed)
    win_pnls = [p for p in pnls if p > 0]
    loss_pnls = [p for p in pnls if p < 0]
    gross_profit = sum(win_pnls)
    gross_loss = sum(-p for p in loss_pnls)
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else None
    win_rate = (wins / n * 100) if n else None
    avg_win = (sum(win_pnls) / len(win_pnls)) if win_pnls else None
    avg_loss = (sum(loss_pnls) / len(loss_pnls)) if loss_pnls else None
    avg_rr = (sum(rrs) / len(rrs)) if rrs else None
    total_pnl = sum(pnls)
    checklist_discipline = (
        sum(checklist_fractions) / len(checklist_fractions) * 100
        if checklist_fractions else None
    )

    best = sorted(sym_pnl.items(), key=lambda kv: kv[1], reverse=True)
    sym_lines = "\n".join(f"  - {s}: {_fmt(p, ' دلار')}" for s, p in best[:8]) or "  —"

    current = balances.current_balance(user, trades, transactions)
    peak_equity = max(equity_curve) if equity_curve else (user.wallet_margin or 0.0)
    trough_equity = min(equity_curve) if equity_curve else (user.wallet_margin or 0.0)

    dir_total = sum(direction_count.values()) or 1
    direction_lines = (
        f"  - لانگ: {direction_count['LONG']} ({_fmt(direction_count['LONG'] / dir_total * 100, '٪')})\n"
        f"  - شورت: {direction_count['SHORT']} ({_fmt(direction_count['SHORT'] / dir_total * 100, '٪')})"
    )
    session_lines = "\n".join(
        f"  - {s}: {sess_count[s]} معامله | سود/زیان {_fmt(sess_pnl[s], ' دلار')}"
        for s in sorted(sess_count, key=lambda k: sess_count[k], reverse=True)
    ) or "  —"

    # Keep the trade list bounded so the prompt stays within reasonable limits.
    if len(rows) > 100:
        rows = rows[-100:]
        rows.insert(0, "  (فقط ۱۰۰ معامله‌ی آخر برای امتیازدهی نمایش داده شده)")

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
        "## داده‌های داشبورد (کلی — جدای از معاملات تک‌تک)",
        f"میانگین برد: {_fmt(avg_win, ' دلار')} | میانگین باخت: {_fmt(avg_loss, ' دلار')}",
        f"سود ناخالص: {_fmt(gross_profit, ' دلار')} | زیان ناخالص: {_fmt(gross_loss, ' دلار')}",
        f"بالاترین موجودی ثبت‌شده (peak): {_fmt(peak_equity, ' دلار')} | "
        f"پایین‌ترین موجودی ثبت‌شده (trough): {_fmt(trough_equity, ' دلار')}",
        f"میانگین رعایت چک‌لیست در کل معاملات: {_fmt(checklist_discipline, '٪') if checklist_discipline is not None else '—'}",
        "تفکیک جهت معاملات:",
        direction_lines,
        "آمار به تفکیک سشن معاملاتی:",
        session_lines,
        "",
        "## سود/زیان به تفکیک نماد",
        sym_lines,
        "",
        "## فهرست تک‌تک معاملات (پارامترهای هر معامله)",
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

    return await _send(url, headers, payload, style)


async def _send(url: str, headers: dict, payload: dict, style: str) -> str:
    """Stream the request and accumulate the assistant's text.

    Streaming is essential here: gateways such as zyloo.io sit behind Cloudflare,
    which returns a 524 if the origin sends nothing within ~100s. A long model
    generation easily exceeds that. With ``stream: true`` the gateway emits tokens
    within a couple of seconds, so the connection keeps flowing and never trips
    the timeout. We re-assemble the full text server-side and return it as usual.
    """
    payload = {**payload, "stream": True}
    # `read` is the max gap *between* streamed chunks (not the whole call), so a
    # long generation is fine as long as tokens keep arriving; a truly hung
    # upstream still fails instead of blocking forever.
    timeout = httpx.Timeout(connect=30.0, read=90.0, write=30.0, pool=30.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", "replace")[:300]
                    raise AIRequestError(
                        f"سرویس هوش مصنوعی خطا برگرداند ({resp.status_code}): {body}"
                    )
                parts: list[str] = []
                raw: list[str] = []
                async for line in resp.aiter_lines():
                    chunk = _parse_sse_line(line, style)
                    if chunk:
                        parts.append(chunk)
                    elif line:
                        raw.append(line)
    except AIRequestError:
        raise
    except httpx.HTTPError as exc:
        raise AIRequestError(f"خطا در ارتباط با سرویس هوش مصنوعی: {exc}") from exc

    text = "".join(parts).strip()
    if not text and raw:
        # Gateway ignored `stream` and returned a normal JSON body — parse it.
        try:
            data = json.loads("".join(raw))
            text = (_anthropic_text(data) if style == "anthropic" else _openai_text(data)).strip()
        except ValueError:
            pass
    if not text:
        raise AIRequestError("پاسخ خالی از سرویس هوش مصنوعی دریافت شد.")
    return text


def _parse_sse_line(line: str, style: str) -> str:
    """Extract a text delta from one SSE line (OpenAI- or Anthropic-style)."""
    if not line:
        return ""
    line = line.strip()
    if not line.startswith("data:"):
        return ""
    data = line[len("data:"):].strip()
    if not data or data == "[DONE]":
        return ""
    try:
        obj = json.loads(data)
    except ValueError:
        return ""
    if style == "anthropic":
        if obj.get("type") == "content_block_delta":
            delta = obj.get("delta") or {}
            if delta.get("type") == "text_delta":
                return delta.get("text") or ""
        return ""
    # OpenAI-compatible streaming delta
    try:
        choice = (obj.get("choices") or [{}])[0]
        delta = choice.get("delta") or {}
        return delta.get("content") or ""
    except (IndexError, AttributeError, TypeError):
        return ""


# Chat replies are short and conversational — keep them snappy.
_CHAT_MAX_TOKENS = 1500
_CHAT_CONTEXT_LIMIT = 14000  # chars of grounding context to include
_CHAT_HISTORY_TURNS = 16     # most recent turns kept in the prompt

_CHAT_SYSTEM_PROMPT = """\
تو یک مربی حرفه‌ای معامله‌گری کریپتو هستی که با خودِ معامله‌گر گفتگو می‌کنی.
بر اساس «اطلاعات زمینه» (داده‌ها و تحلیل معاملات او) که در ادامه می‌آید، به سؤال‌های او پاسخ بده.

قواعد:
- کوتاه، دقیق و عملی پاسخ بده؛ از پرگویی پرهیز کن (در حد چند جمله یا چند بولت).
- فقط بر اساس داده‌های واقعی همین کاربر صحبت کن؛ اگر داده‌ای نیست صادقانه بگو.
- همیشه جهت‌گیریِ پاسخ به‌سمت بهبود کیفیت معاملات، وین‌ریت و مدیریت ریسک کاربر باشد.
- به فارسی پاسخ بده.

اطلاعات زمینه:
{context}
"""


async def chat_reply(
    context_text: str,
    history: list[dict],
    message: str,
) -> str:
    """Multi-turn coach chat grounded in ``context_text``."""
    key = _api_key()
    if not key:
        raise AINotConfigured(
            "گفتگوی هوش مصنوعی فعال نیست. کلید API در سرور تنظیم نشده است."
        )
    style = (settings.AI_API_STYLE or "openai").strip().lower()
    system = _CHAT_SYSTEM_PROMPT.format(context=(context_text or "—")[:_CHAT_CONTEXT_LIMIT])

    turns: list[dict] = []
    for m in history[-_CHAT_HISTORY_TURNS:]:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            turns.append({"role": role, "content": content})
    turns.append({"role": "user", "content": message.strip()})

    if style == "anthropic":
        base = (settings.AI_BASE_URL or "https://api.anthropic.com").rstrip("/")
        payload = {
            "model": settings.AI_MODEL,
            "max_tokens": _CHAT_MAX_TOKENS,
            "system": system,
            "messages": turns,
        }
        headers = {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        url = f"{base}/v1/messages"
    else:
        base = (settings.AI_BASE_URL or "").rstrip("/")
        if not base:
            raise AINotConfigured("AI_BASE_URL برای حالت openai تنظیم نشده است.")
        payload = {
            "model": settings.AI_MODEL,
            "max_tokens": _CHAT_MAX_TOKENS,
            "messages": [{"role": "system", "content": system}, *turns],
        }
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        url = f"{base}/chat/completions"

    return await _send(url, headers, payload, style)


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
    # The per-trade scoring table scales with trade count, so allow more room
    # than a single-trade review (the prompt itself enforces conciseness).
    return await _complete(
        _OVERALL_SYSTEM_PROMPT, summary, max_tokens=settings.AI_REPORT_MAX_TOKENS
    )


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
