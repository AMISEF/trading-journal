"""تقویم جلالی (شمسی) — تبدیل تاریخ و ساختنِ بازه‌های زمانیِ لیگ تریدرها.

الگوریتمِ تبدیل همان jalaali-js است که فرانت‌اند استفاده می‌کند (`lib/jalali.ts`)،
تا تاریخی که کاربر در مرورگر می‌بیند دقیقاً همان بازه‌ای باشد که بک‌اند حساب
می‌کند. تقسیم‌ها با «کوتاه‌کردن به‌سمت صفر» انجام می‌شود (نه floor) — همان
رفتاری که jalaali-js دارد.

هفته در ایران از **شنبه** شروع می‌شود و به **جمعه** ختم می‌شود؛ همهٔ بازه‌های
هفتگی اینجا بر همین مبنا ساخته می‌شوند.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

JALALI_MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
]

#: نامِ فصل‌های شمسی (هر فصل = سه ماه).
JALALI_QUARTERS = ["بهار", "تابستان", "پاییز", "زمستان"]

PERIODS = ("daily", "weekly", "monthly", "quarterly", "yearly")


def _div(a: int, b: int) -> int:
    """تقسیم با کوتاه‌کردن به‌سمت صفر (رفتار jalaali-js)."""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


def _mod(a: int, b: int) -> int:
    return a - _div(a, b) * b


def _jal_cal(jy: int) -> tuple[int, int, int]:
    """(leap, gy, march) — همان jalCal در jalaali-js."""
    breaks = [
        -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060,
        2097, 2192, 2262, 2324, 2394, 2456, 3178,
    ]
    gy = jy + 621
    leap_j = -14
    jp = breaks[0]
    jm = jump = 0
    for i in range(1, len(breaks)):
        jm = breaks[i]
        jump = jm - jp
        if jy < jm:
            break
        leap_j += _div(jump, 33) * 8 + _div(_mod(jump, 33), 4)
        jp = jm
    n = jy - jp
    leap_j += _div(n, 33) * 8 + _div(_mod(n, 33) + 3, 4)
    if _mod(jump, 33) == 4 and jump - n == 4:
        leap_j += 1
    leap_g = _div(gy, 4) - _div((_div(gy, 100) + 1) * 3, 4) - 150
    march = 20 + leap_j - leap_g
    if jump - n < 6:
        n = n - jump + _div(jump + 4, 33) * 33
    leap = _mod(_mod(n + 1, 33) - 1, 4)
    if leap == -1:
        leap = 4
    return leap, gy, march


def _g2d(gy: int, gm: int, gd: int) -> int:
    d = (
        _div((gy + _div(gm - 8, 6) + 100100) * 1461, 4)
        + _div(153 * _mod(gm + 9, 12) + 2, 5)
        + gd
        - 34840408
    )
    return d - _div(_div(gy + 100100 + _div(gm - 8, 6), 100) * 3, 4) + 752


def _d2g(jdn: int) -> tuple[int, int, int]:
    j = 4 * jdn + 139361631
    j = j + _div(_div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
    i = _div(_mod(j, 1461), 4) * 5 + 308
    gd = _div(_mod(i, 153), 5) + 1
    gm = _mod(_div(i, 153), 12) + 1
    gy = _div(j, 1461) - 100100 + _div(8 - gm, 6)
    return gy, gm, gd


def _j2d(jy: int, jm: int, jd: int) -> int:
    leap, gy, march = _jal_cal(jy)
    return _g2d(gy, 3, march) + (jm - 1) * 31 - _div(jm, 7) * (jm - 7) + jd - 1


def _d2j(jdn: int) -> tuple[int, int, int]:
    gy = _d2g(jdn)[0]
    jy = gy - 621
    leap, _gy, march = _jal_cal(jy)
    jdn1f = _g2d(gy, 3, march)
    k = jdn - jdn1f
    if k >= 0:
        if k <= 185:
            return jy, 1 + _div(k, 31), _mod(k, 31) + 1
        k -= 186
    else:
        jy -= 1
        k += 179
        if leap == 1:
            k += 1
    return jy, 7 + _div(k, 30), _mod(k, 30) + 1


def to_jalali(d: date) -> tuple[int, int, int]:
    """(سال، ماه، روزِ) شمسیِ یک تاریخ میلادی."""
    return _d2j(_g2d(d.year, d.month, d.day))


def to_gregorian(jy: int, jm: int, jd: int) -> date:
    """تاریخ میلادیِ متناظر با یک تاریخ شمسی."""
    gy, gm, gd = _d2g(_j2d(jy, jm, jd))
    return date(gy, gm, gd)


def is_leap_year(jy: int) -> bool:
    """سالِ کبیسهٔ شمسی (اسفند ۳۰ روزه)."""
    return _jal_cal(jy)[0] == 0


def days_in_month(jy: int, jm: int) -> int:
    if jm <= 6:
        return 31
    if jm <= 11:
        return 30
    return 30 if is_leap_year(jy) else 29


# ---------------------------------------------------------------------------
# بازه‌های زمانیِ لیگ
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Window:
    """یک بازهٔ زمانی: از ``start`` تا ``end`` (هر دو شاملِ خودِ روز).

    ``key`` شناسهٔ پایدارِ بازه است (مثلاً ``1404-05`` برای مردادِ ۱۴۰۴) و برای
    رفتن به بازهٔ قبلی/بعدی از سمتِ فرانت‌اند استفاده می‌شود.
    """

    period: str
    start: date
    end: date
    key: str
    label: str

    @property
    def start_dt(self) -> datetime:
        """ابتدای بازه به‌صورت datetime آگاه‌به‌زمان (UTC)."""
        return datetime.combine(self.start, time.min, tzinfo=timezone.utc)

    @property
    def end_dt(self) -> datetime:
        """انتهای بازه — لحظهٔ پایانِ آخرین روز (UTC)."""
        return datetime.combine(self.end, time.max, tzinfo=timezone.utc)

    def contains(self, moment: datetime | date | None) -> bool:
        if moment is None:
            return False
        d = moment.date() if isinstance(moment, datetime) else moment
        return self.start <= d <= self.end


def _week_start(d: date) -> date:
    """شنبهٔ همان هفته. ``date.weekday()``: دوشنبه=۰ … شنبه=۵، یکشنبه=۶."""
    return d - timedelta(days=(d.weekday() + 2) % 7)


def _quarter_of(jm: int) -> int:
    """شمارهٔ فصل (۱ تا ۴) برای یک ماهِ شمسی."""
    return (jm - 1) // 3 + 1


def _fa(n: int) -> str:
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def window_for(period: str, anchor: date | None = None, key: str | None = None) -> Window:
    """بازهٔ خواسته‌شده را بساز.

    ``key`` (اگر داده شود) بازه را مستقیماً مشخص می‌کند تا کاربر بتواند در
    لیدربرد بین بازه‌ها جابه‌جا شود:

    ==========  ==============  ==========================================
    period      شکلِ key         نمونه
    ==========  ==============  ==========================================
    daily       ``jy-jm-jd``    ``1404-05-09``
    weekly      ``jy-jm-jd``    شنبهٔ آن هفته، ``1404-05-04``
    monthly     ``jy-jm``       ``1404-05``
    quarterly   ``jy-Qn``       ``1404-Q2``
    yearly      ``jy``          ``1404``
    ==========  ==============  ==========================================

    اگر ``key`` نامعتبر یا خالی باشد، بازهٔ شاملِ ``anchor`` (پیش‌فرض: امروز)
    برگردانده می‌شود.
    """
    if period not in PERIODS:
        raise ValueError(f"بازهٔ نامعتبر: {period}")
    anchor = anchor or datetime.now(timezone.utc).date()
    jy, jm, jd = to_jalali(anchor)

    if key:
        try:
            if period == "yearly":
                jy = int(key)
            elif period == "quarterly":
                y, q = key.split("-Q")
                jy, jm = int(y), (int(q) - 1) * 3 + 1
            elif period == "monthly":
                y, m = key.split("-")[:2]
                jy, jm = int(y), int(m)
            else:  # daily / weekly
                y, m, d = key.split("-")[:3]
                jy, jm, jd = int(y), int(m), int(d)
        except (ValueError, IndexError):
            pass  # کلیدِ خراب → همان بازهٔ شاملِ anchor

    if period == "daily":
        day = to_gregorian(jy, jm, min(jd, days_in_month(jy, jm)))
        return Window(
            period, day, day,
            key=f"{jy}-{jm:02d}-{jd:02d}",
            label=f"{_fa(jd)} {JALALI_MONTHS[jm - 1]} {_fa(jy)}",
        )

    if period == "weekly":
        start = _week_start(to_gregorian(jy, jm, min(jd, days_in_month(jy, jm))))
        end = start + timedelta(days=6)
        sy, sm, sd = to_jalali(start)
        ey, em, ed = to_jalali(end)
        label = (
            f"{_fa(sd)} {JALALI_MONTHS[sm - 1]} تا {_fa(ed)} {JALALI_MONTHS[em - 1]} {_fa(ey)}"
        )
        return Window(period, start, end, key=f"{sy}-{sm:02d}-{sd:02d}", label=label)

    if period == "monthly":
        start = to_gregorian(jy, jm, 1)
        end = to_gregorian(jy, jm, days_in_month(jy, jm))
        return Window(
            period, start, end,
            key=f"{jy}-{jm:02d}",
            label=f"{JALALI_MONTHS[jm - 1]} {_fa(jy)}",
        )

    if period == "quarterly":
        q = _quarter_of(jm)
        first, last = (q - 1) * 3 + 1, (q - 1) * 3 + 3
        start = to_gregorian(jy, first, 1)
        end = to_gregorian(jy, last, days_in_month(jy, last))
        return Window(
            period, start, end,
            key=f"{jy}-Q{q}",
            label=f"{JALALI_QUARTERS[q - 1]} {_fa(jy)}",
        )

    # yearly
    start = to_gregorian(jy, 1, 1)
    end = to_gregorian(jy, 12, days_in_month(jy, 12))
    return Window(period, start, end, key=str(jy), label=f"سال {_fa(jy)}")


def shift(window: Window, delta: int) -> Window:
    """بازهٔ ``delta`` تا جلوتر/عقب‌تر از بازهٔ داده‌شده (مثلاً ماهِ قبل)."""
    if delta == 0:
        return window
    if window.period == "daily":
        return window_for("daily", anchor=window.start + timedelta(days=delta))
    if window.period == "weekly":
        return window_for("weekly", anchor=window.start + timedelta(weeks=delta))

    jy, jm, _jd = to_jalali(window.start)
    if window.period == "monthly":
        total = (jy * 12 + (jm - 1)) + delta
        return window_for("monthly", key=f"{total // 12}-{total % 12 + 1:02d}")
    if window.period == "quarterly":
        total = (jy * 4 + (_quarter_of(jm) - 1)) + delta
        return window_for("quarterly", key=f"{total // 4}-Q{total % 4 + 1}")
    return window_for("yearly", key=str(jy + delta))
