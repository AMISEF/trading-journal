"""لیگ تریدرها (Traders League) — رتبه‌بندیِ کاربران در یک بازهٔ زمانیِ شمسی.

هر کاربر در بازهٔ انتخاب‌شده (روزانه / هفتگی / ماهانه / فصلی / سالانه) با
معاملاتِ **بسته‌شدهٔ** خودش سنجیده می‌شود و برای هر معیار یک عدد می‌گیرد:

    درصد سود، سود دلاری، حجم معاملات، میانگین اهرم، حداکثر افت سرمایه،
    ضریب سود، وین‌ریت، میانگین R، بلندترین رگبار برد، انضباط چک‌لیست،
    روزهای سبز، و «امتیاز لیگ» که ترکیبی وزن‌دار از همهٔ این‌هاست.

قواعدِ مسابقه
-------------
* **هر کسی که حساب دارد عضوِ لیگ است.** حتی اگر در این دوره هیچ معامله‌ای نبسته
  باشد، ردیفش در جدول می‌آید (در انتهای فهرست، با وضعیتِ «بدون معامله در این
  دوره») تا هیچ‌کس از لیگ غیب نشود. تنها حسابِ دموی سایت بیرون است.
* مبنای درصدِ سود، موجودیِ کاربر در **لحظهٔ شروع بازه** است، نه موجودیِ الان.
  پس کسی که با سرمایهٔ بزرگ‌تر معامله می‌کند مزیتِ خودکار نمی‌گیرد.
* فقط چرخهٔ سرمایهٔ فعال حساب می‌شود (بعد از ریست ماهانه به ۱۰۰۰ دلار،
  معاملاتِ ماهِ قبل روی نتیجهٔ ماهِ جدید اثر ندارند).
* وین‌ریت از ``dashboard_stats.win_rate`` می‌آید؛ معاملات سربه‌سر در مخرج نیستند.
* برای جلوگیری از قهرمان‌شدن با یک معاملهٔ شانسی، کسی که کمتر از
  :data:`MIN_TRADES` معاملهٔ بسته‌شده در بازه دارد «واجد شرایط» نیست و بعد از
  همهٔ واجدین شرایط فهرست می‌شود (حذف نمی‌شود تا انگیزهٔ ادامه بماند).

ترتیبِ نهاییِ جدول سه لایه دارد: اول واجدین شرایط، بعد کسانی که معامله داشته‌اند
ولی به حد نصاب نرسیده‌اند، و آخر کسانی که در این دوره معامله‌ای نبسته‌اند.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.exchange_credential import ExchangeCredential
from app.models.trade import Trade
from app.models.user import User
from app.services import balances, calc as calc_engine, dashboard_stats, jalali

#: کمینهٔ معاملهٔ بسته‌شده در بازه برای «واجد شرایط» شدن.
MIN_TRADES = 3

#: تعداد ردیف در هر صفحهٔ لیدربرد (و سقفِ مجازِ درخواست).
PAGE_SIZE = 100
MAX_PAGE_SIZE = 200


#: معیارهای رتبه‌بندی. ``higher_is_better=False`` یعنی کمتر بهتر است (افت سرمایه).
@dataclass(frozen=True)
class Metric:
    key: str
    label: str
    unit: str          # "percent" | "usd" | "ratio" | "count" | "x" | "score"
    higher_is_better: bool = True
    hint: str = ""


METRICS: tuple[Metric, ...] = (
    Metric("pnlPercent", "درصد سود", "percent",
           hint="بازدهٔ خالص نسبت به موجودیِ ابتدای دوره — معیارِ پیش‌فرضِ لیگ."),
    Metric("score", "امتیاز لیگ", "score",
           hint="امتیازِ ترکیبی از بازده، وین‌ریت، ضریب سود، کنترل ریسک و انضباط."),
    Metric("pnlUsd", "سود دلاری", "usd",
           hint="مجموع سود/زیانِ تحقق‌یافته در دوره."),
    Metric("volume", "حجم معاملات", "usd",
           hint="مجموع اندازهٔ پوزیشن‌ها (مارجین × اهرم)."),
    Metric("avgLeverage", "میانگین اهرم", "x",
           hint="میانگینِ اهرمِ به‌کاررفته در معاملاتِ دوره."),
    Metric("maxDrawdown", "حداکثر افت سرمایه", "percent", higher_is_better=False,
           hint="بیشترین افتِ موجودی از سقف تا کفِ دوره — هرچه کمتر، بهتر."),
    Metric("profitFactor", "ضریب سود", "ratio",
           hint="مجموع سودها ÷ مجموع زیان‌ها."),
    Metric("winRate", "وین‌ریت", "percent",
           hint="سودده ÷ (سودده + زیان‌ده)؛ معاملات سربه‌سر شمرده نمی‌شوند."),
    Metric("avgRr", "میانگین R", "ratio",
           hint="میانگینِ نسبتِ ریسک به ریوارِد کسب‌شده."),
    Metric("winStreak", "بلندترین رگبار برد", "count",
           hint="بیشترین تعداد بردِ پشت‌سرهم در دوره."),
    Metric("greenDays", "روزهای سبز", "percent",
           hint="سهم روزهایی که با سود بسته شده‌اند."),
    Metric("discipline", "انضباط چک‌لیست", "percent",
           hint="میانگینِ آیتم‌های تیک‌خوردهٔ چک‌لیست در معاملاتِ دوره."),
    Metric("tradeCount", "تعداد معاملات", "count",
           hint="تعداد معاملاتِ بسته‌شده در دوره."),
)

METRIC_KEYS = {m.key for m in METRICS}
DEFAULT_METRIC = "pnlPercent"


@dataclass
class Entry:
    """یک ردیفِ لیدربرد."""

    user_id: int
    username: str
    exchanges: list[str] = field(default_factory=list)
    trade_count: int = 0
    wins: int = 0
    losses: int = 0
    breakeven: int = 0
    start_balance: float = 0.0
    end_balance: float = 0.0
    pnl_usd: float = 0.0
    pnl_percent: float = 0.0
    volume: float = 0.0
    avg_leverage: float | None = None
    max_drawdown: float = 0.0
    profit_factor: float | None = None
    win_rate: float | None = None
    avg_rr: float | None = None
    win_streak: int = 0
    green_days: float | None = None
    discipline: float | None = None
    best_trade: float = 0.0
    worst_trade: float = 0.0
    score: float = 0.0
    qualified: bool = False

    @property
    def active(self) -> bool:
        """آیا در این دوره حتی یک معاملهٔ بسته‌شده دارد؟"""
        return self.trade_count > 0

    def value_of(self, metric: str) -> float | None:
        return {
            "pnlPercent": self.pnl_percent,
            "score": self.score,
            "pnlUsd": self.pnl_usd,
            "volume": self.volume,
            "avgLeverage": self.avg_leverage,
            "maxDrawdown": self.max_drawdown,
            "profitFactor": self.profit_factor,
            "winRate": self.win_rate,
            "avgRr": self.avg_rr,
            "winStreak": float(self.win_streak),
            "greenDays": self.green_days,
            "discipline": self.discipline,
            "tradeCount": float(self.trade_count),
        }.get(metric)


def _trade_day(t: Trade) -> datetime | None:
    """روزی که معامله به آن تعلق دارد — همان قاعدهٔ داشبورد."""
    return t.close_date or t.open_date or getattr(t, "created_at", None)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _score(e: Entry) -> float:
    """امتیازِ لیگ (۰ تا ۱۰۰) — بازده تنها بخشِ ماجرا نیست.

    ترکیبِ وزن‌دارِ پنج ستون تا مسابقه به «همه‌چیز را روی یک معامله ببند»
    تبدیل نشود:

    * بازده (۴۵ امتیاز): از ‎-۵۰٪ تا ‎+۱۰۰٪ خطی نگاشت می‌شود.
    * وین‌ریت (۱۵ امتیاز)
    * ضریب سود (۱۵ امتیاز): تا ۳ به بالا امتیازِ کامل.
    * کنترل ریسک (۱۵ امتیاز): افتِ صفر امتیازِ کامل، افتِ ۵۰٪ به بالا صفر.
    * انضباط چک‌لیست (۱۰ امتیاز)
    """
    ret = (_clamp(e.pnl_percent, -50.0, 100.0) + 50.0) / 150.0 * 45.0
    wr = (e.win_rate or 0.0) * 15.0
    pf = _clamp((e.profit_factor if e.profit_factor is not None else 0.0) / 3.0, 0.0, 1.0) * 15.0
    dd = (1.0 - _clamp(e.max_drawdown, 0.0, 50.0) / 50.0) * 15.0
    disc = (e.discipline or 0.0) * 10.0
    return round(ret + wr + pf + dd + disc, 2)


async def _load_exchanges(db: AsyncSession, user_ids: list[int]) -> dict[int, list[str]]:
    """کدام صرافی‌ها را هر کاربر متصل کرده است.

    توبیت روی ستون‌های قدیمیِ خودِ کاربر ذخیره می‌شود و بقیهٔ صرافی‌ها در جدول
    ``exchange_credentials`` — این‌جا هر دو با هم جمع می‌شوند.
    """
    out: dict[int, list[str]] = defaultdict(list)
    if not user_ids:
        return out
    rows = await db.execute(
        select(ExchangeCredential.user_id, ExchangeCredential.exchange)
        .where(ExchangeCredential.user_id.in_(user_ids))
        .where(ExchangeCredential.api_key_enc.is_not(None))
    )
    for uid, slug in rows.all():
        out[uid].append(slug)
    return out


async def _load_trades(db: AsyncSession, user_ids: list[int]) -> dict[int, list[Trade]]:
    """همهٔ معاملاتِ چند کاربر را یک‌جا بخوان (به‌جای یک کوئری به‌ازای هر کاربر)."""
    if not user_ids:
        return {}
    rows = await db.execute(
        select(Trade)
        .where(Trade.user_id.in_(user_ids))
        .options(selectinload(Trade.take_profits))
        .order_by(Trade.user_id, Trade.number)
    )
    grouped: dict[int, list[Trade]] = defaultdict(list)
    for t in rows.scalars().all():
        grouped[t.user_id].append(t)
    return grouped


def build_entry(user: User, trades: list[Trade], window: jalali.Window,
                exchanges: list[str]) -> Entry:
    """آمارِ یک کاربر در یک بازه را بساز."""
    entry = Entry(user_id=user.id, username=user.username, exchanges=sorted(exchanges))

    cycle = [t for t in trades if balances.in_active_cycle(t, user.capital_reset_date)]
    closed = sorted((t for t in cycle if t.status == "CLOSED"), key=lambda t: t.number)

    balance = float(user.wallet_margin or 0.0)
    start_balance: float | None = None
    equity: list[float] = []          # موجودی بعد از هر معاملهٔ داخلِ بازه
    pnls: list[float] = []
    rrs: list[float] = []
    levs: list[float] = []
    fractions: list[float] = []
    by_day: dict[str, float] = defaultdict(float)
    volume = 0.0

    for t in closed:
        day = _trade_day(t)
        in_window = window.contains(day)
        if day is not None and day.date() > window.end:
            # معاملاتِ بعد از بازه نه در نتیجهٔ دوره می‌آیند و نه موجودیِ ابتدای
            # آن را جابه‌جا می‌کنند. (اینجا `continue` است نه `break`، چون ترتیبِ
            # شماره‌ها لزوماً با ترتیبِ تاریخ‌ها یکی نیست.)
            continue
        if in_window and start_balance is None:
            start_balance = balance

        result = calc_engine.compute(
            direction=t.direction,
            entry=t.entry_price,
            leverage=t.leverage,
            margin_percent=t.margin_percent,
            wallet_balance_now=(t.balance_snapshot if t.balance_snapshot is not None else balance),
            stop_loss=t.stop_loss,
            take_profits=[
                {"order": tp.order, "price": tp.price, "save_percent": tp.save_percent}
                for tp in t.take_profits
            ],
            exit_type=t.exit_type,
            trail_value=t.trail_exit_value,
            trail_is_percent=bool(t.trail_is_percent),
            exit_price=t.exit_price,
        )
        pnl = result["realizedPnl"]
        balance += pnl
        if not in_window:
            continue

        pnls.append(pnl)
        equity.append(balance)
        volume += float(result.get("positionSize") or 0.0)
        rr = result.get("rrAchieved")
        if getattr(t, "source", None) == "toobit" and t.rr_achieved is not None:
            rr = t.rr_achieved
        if rr is not None:
            rrs.append(rr)
        if t.leverage and float(t.leverage) > 0:
            levs.append(float(t.leverage))
        ticks = t.checklist_ticks or {}
        if isinstance(ticks, dict) and ticks:
            fractions.append(sum(1 for v in ticks.values() if v) / len(ticks))
        if day is not None:
            by_day[day.date().isoformat()] += pnl

    if start_balance is None:
        start_balance = balance
    entry.start_balance = start_balance
    entry.end_balance = start_balance + sum(pnls)
    entry.trade_count = len(pnls)
    if not pnls:
        return entry

    entry.pnl_usd = sum(pnls)
    entry.pnl_percent = (entry.pnl_usd / start_balance * 100.0) if start_balance > 0 else 0.0
    entry.volume = volume
    entry.wins = sum(1 for p in pnls if dashboard_stats.is_win(p))
    entry.losses = sum(1 for p in pnls if dashboard_stats.is_loss(p))
    entry.breakeven = sum(1 for p in pnls if dashboard_stats.is_breakeven(p))
    entry.win_rate = dashboard_stats.win_rate(pnls)
    entry.avg_leverage = (sum(levs) / len(levs)) if levs else None
    entry.avg_rr = (sum(rrs) / len(rrs)) if rrs else None
    entry.best_trade = max(pnls)
    entry.worst_trade = min(pnls)
    entry.discipline = (sum(fractions) / len(fractions)) if fractions else None

    gross_profit = sum(p for p in pnls if dashboard_stats.is_win(p))
    gross_loss = sum(-p for p in pnls if dashboard_stats.is_loss(p))
    entry.profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else None

    # بیشترین افتِ موجودی داخل بازه (درصدی از سقفِ همان لحظه)
    peak = start_balance
    worst = 0.0
    for bal in equity:
        peak = max(peak, bal)
        if peak > 0:
            worst = max(worst, (peak - bal) / peak * 100.0)
    entry.max_drawdown = worst

    # بلندترین رگبار برد
    best = run = 0
    for p in pnls:
        run = run + 1 if dashboard_stats.is_win(p) else 0
        best = max(best, run)
    entry.win_streak = best

    if by_day:
        green = sum(1 for v in by_day.values() if v > 0)
        entry.green_days = green / len(by_day)

    entry.qualified = entry.trade_count >= MIN_TRADES
    entry.score = _score(entry)
    return entry


def sort_entries(entries: list[Entry], metric: str) -> list[Entry]:
    """مرتب‌سازی بر اساس معیار، در سه لایه.

    ۱) واجدین شرایط، ۲) کسانی که معامله داشته‌اند ولی به حد نصاب نرسیده‌اند،
    ۳) کسانی که در این دوره معامله‌ای نبسته‌اند. مقدارِ نامشخص (مثلاً ضریب سودِ
    کسی که هیچ زیانی نداشته) همیشه آخرِ لایهٔ خودش می‌آید تا «داده نداریم» با
    «عملکرد ضعیف» اشتباه گرفته نشود.
    """
    spec = next((m for m in METRICS if m.key == metric), METRICS[0])
    sign = -1.0 if spec.higher_is_better else 1.0

    def key(e: Entry):
        v = e.value_of(spec.key)
        if spec.key == "profitFactor" and v is None and e.pnl_usd > 0:
            # هیچ معاملهٔ زیان‌دهی نداشته: ضریب سود «بی‌نهایت» است، نه نامعلوم —
            # پس باید بالای جدول بایستد نه انتهای آن.
            v = float("inf")
        return (
            0 if e.active else 1,      # بی‌معامله‌ها همیشه ته جدول
            0 if e.qualified else 1,
            0 if v is not None else 1,
            sign * (v if v is not None else 0.0),
            -e.score,          # هم‌امتیازها با امتیازِ کلیِ لیگ جدا می‌شوند
            e.username,
        )

    return sorted(entries, key=key)


async def leaderboard(
    db: AsyncSession,
    window: jalali.Window,
    metric: str = DEFAULT_METRIC,
    *,
    previous: jalali.Window | None = None,
) -> tuple[list[Entry], dict[int, int | None]]:
    """لیدربردِ **همهٔ** کاربران در یک بازه + جابه‌جاییِ رتبه نسبت به بازهٔ قبل.

    خروجی: (ردیف‌های مرتب‌شده، نگاشتِ ``user_id`` → تغییر رتبه). تغییر رتبه مثبت
    یعنی صعود؛ ``None`` یعنی در دورهٔ قبل معامله‌ای نداشته.

    فهرست شامل همهٔ کاربران است — حتی آن‌ها که در این دوره معامله‌ای نبسته‌اند —
    و صفحه‌بندی در لایهٔ API انجام می‌شود.
    """
    if metric not in METRIC_KEYS:
        metric = DEFAULT_METRIC

    # تنها حسابی که در لیگ نمی‌آید، حسابِ دموی نمایشیِ سایت است.
    rows = await db.execute(select(User).where(User.is_demo.is_not(True)))
    users = list(rows.scalars().all())
    ids = [u.id for u in users]
    trades_by_user = await _load_trades(db, ids)
    exchanges = await _load_exchanges(db, ids)
    for u in users:
        if getattr(u, "toobit_api_key_enc", None):
            exchanges[u.id].append("toobit")

    entries = [
        build_entry(u, trades_by_user.get(u.id, []), window, exchanges.get(u.id, []))
        for u in users
    ]
    ordered = sort_entries(entries, metric)

    moves: dict[int, int | None] = {}
    if previous is not None:
        prev_entries = [
            build_entry(u, trades_by_user.get(u.id, []), previous, exchanges.get(u.id, []))
            for u in users
        ]
        # مقایسهٔ رتبه فقط بین کسانی معنا دارد که در آن دوره معامله کرده‌اند؛
        # وگرنه ردیف‌های خالیِ ته جدول به هم «صعود/نزول» نسبت می‌دادند.
        prev_rank = {
            e.user_id: i
            for i, e in enumerate(e for e in sort_entries(prev_entries, metric) if e.active)
        }
        now_rank = {e.user_id: i for i, e in enumerate(e for e in ordered if e.active)}
        for e in ordered:
            old = prev_rank.get(e.user_id)
            new = now_rank.get(e.user_id)
            moves[e.user_id] = None if old is None or new is None else old - new
    return ordered, moves
