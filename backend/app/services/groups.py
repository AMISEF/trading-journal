"""عضویتِ کاربر در چند «گروه نمایشی» به‌طور هم‌زمان.

تا پیش از این، ستون `users.user_group` فقط نامِ یک گروه را نگه می‌داشت؛ پس هر
کاربر یا عضوِ «تیم کریپتو اسمارت» (`CRYPTOSMART_TEAM`) بود یا عضوِ «لایو ترید»
(`LIVE_TRADE`) — هرگز هر دو. اکنون همان ستون یک لیستِ کاما-جدا نگه می‌دارد،
مثلاً `"CRYPTOSMART_TEAM,LIVE_TRADE"`، و این ماژول تنها جایی است که بین آن رشته
و لیستِ گروه‌ها تبدیل انجام می‌شود.

نکته‌ها:

* هیچ مهاجرتِ دیتابیسی لازم نیست. مقادیرِ قدیمیِ تک‌گروهی («CRYPTOSMART_TEAM»)
  دقیقاً همان‌طور که هستند خوانده می‌شوند، چون یک لیستِ یک‌عضوی‌اند.
* ترتیبِ ذخیره‌سازی همیشه ثابت است (اول گروه‌های شناخته‌شده، به ترتیبِ
  `KNOWN_GROUPS`) تا یک عضویتِ یکسان همیشه یک رشتهٔ یکسان تولید کند.
* طولِ ستون ۵۰ کاراکتر است و بلندترین ترکیبِ ممکن
  («CRYPTOSMART_TEAM,LIVE_TRADE» = ۲۷ کاراکتر) در آن جا می‌شود.
"""

from __future__ import annotations

from typing import Iterable

# گروهِ ربات‌های الگو (نمایش در تبِ «برایند ربات»).
TEAM_GROUP = "CRYPTOSMART_TEAM"
# گروهِ لایو تریدِ انسانی (نمایش در تبِ «برایند لایو ترید»).
LIVE_TRADE_GROUP = "LIVE_TRADE"

# گروه‌هایی که پنل ادمین اجازهٔ تنظیمشان را می‌دهد.
KNOWN_GROUPS: tuple[str, ...] = (TEAM_GROUP, LIVE_TRADE_GROUP)

SEPARATOR = ","


def parse(raw: str | None) -> list[str]:
    """رشتهٔ ذخیره‌شده را به لیستِ گروه‌ها تبدیل می‌کند (بدون تکرار)."""
    if not raw:
        return []
    out: list[str] = []
    for part in str(raw).split(SEPARATOR):
        name = part.strip()
        if name and name not in out:
            out.append(name)
    return out


def serialize(groups: Iterable[str] | None) -> str | None:
    """لیستِ گروه‌ها را به مقدارِ ستون تبدیل می‌کند؛ لیستِ خالی → None."""
    ordered: list[str] = []
    for group in groups or []:
        name = (group or "").strip()
        if name and name not in ordered:
            ordered.append(name)
    # ترتیبِ پایدار: گروه‌های شناخته‌شده اول، بقیه به ترتیبِ ورود.
    ordered.sort(
        key=lambda g: KNOWN_GROUPS.index(g) if g in KNOWN_GROUPS else len(KNOWN_GROUPS)
    )
    return SEPARATOR.join(ordered) or None


def has(raw: str | None, group: str) -> bool:
    """آیا کاربر عضوِ این گروه است؟"""
    return group in parse(raw)


def primary(raw: str | None) -> str | None:
    """گروهِ «اصلی» برای نمایش و سازگاری با کدِ قدیمیِ تک‌گروهی.

    اگر کاربر عضوِ چند گروه باشد، اولین گروهِ شناخته‌شده برگردانده می‌شود، تا
    نشان‌ها/بج‌های قبلی (مثلاً «Cryptosmart Team» در جدولِ ادمین) مثلِ قبل کار
    کنند.
    """
    groups = parse(raw)
    if not groups:
        return None
    for known in KNOWN_GROUPS:
        if known in groups:
            return known
    return groups[0]


def toggled(raw: str | None, group: str, member: bool) -> str | None:
    """یک گروه را اضافه یا حذف می‌کند و بقیهٔ عضویت‌ها را دست‌نخورده می‌گذارد."""
    groups = parse(raw)
    if member:
        if group not in groups:
            groups.append(group)
    else:
        groups = [g for g in groups if g != group]
    return serialize(groups)


def validate(groups: Iterable[str]) -> list[str]:
    """نام‌های گروه را بررسی می‌کند؛ برای نامِ ناشناس ValueError می‌دهد."""
    checked: list[str] = []
    for group in groups or []:
        name = (group or "").strip()
        if not name:
            continue
        if name not in KNOWN_GROUPS:
            raise ValueError(f"گروه نامعتبر است: {name}")
        if name not in checked:
            checked.append(name)
    return checked
