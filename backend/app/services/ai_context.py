"""Builds the text context handed to the AI coach.

Design goals (from user feedback on the old reports):

* a trade is **never** referenced by bare number - always ``#64 BTCUSDT (شورت)``
* every dashboard metric is exposed, not a hand picked subset
* the trader's own trading plan and checklist templates travel with the data
* per trade we ship entry / stop / targets / exit / R / PnL / reasons /
  emotions / checklist compliance / notes, so the model can score the trade
  on execution quality instead of guessing from the PnL sign

Only stdlib + model attributes are used, so this module cannot break because of
a signature change elsewhere in the service layer.
"""

from __future__ import annotations

import json
from typing import Any, Iterable

try:  # optional, only used to label the trading session
    from app.services.sessions import session_for
except Exception:  # pragma: no cover - defensive

    def session_for(_value: Any) -> str | None:  # type: ignore[misc]
        return None


# ---------------------------------------------------------------------------
# formatting helpers
# ---------------------------------------------------------------------------
def _fmt(value: Any, digits: int = 2) -> str:
    if value is None or value == "":
        return "-"
    if isinstance(value, bool):
        return "بله" if value else "خیر"
    if isinstance(value, (int, float)):
        try:
            if float(value) == int(float(value)) and abs(float(value)) < 1e15:
                return str(int(float(value)))
            return f"{float(value):.{digits}f}"
        except Exception:
            return str(value)
    return str(value)


def _date(value: Any) -> str:
    if not value:
        return "-"
    try:
        return value.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return str(value)[:16]


def _short(text: Any, limit: int = 220) -> str:
    if not text:
        return ""
    body = " ".join(str(text).split())
    return body if len(body) <= limit else body[: limit - 1] + "…"


def _json(value: Any, limit: int = 1800) -> str:
    try:
        body = json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        body = str(value)
    return body if len(body) <= limit else body[:limit] + " …(بریده شد)"


def fa_direction(value: Any) -> str:
    key = str(value or "").lower()
    if "short" in key or "sell" in key or "شورت" in key:
        return "شورت"
    if "long" in key or "buy" in key or "لانگ" in key:
        return "لانگ"
    return str(value or "-")


def trade_label(trade: Any) -> str:
    """``#64 BTCUSDT (شورت)`` - the only allowed way to name a trade."""
    number = getattr(trade, "trade_number", None) or getattr(trade, "number", None)
    number = number or getattr(trade, "id", None) or "?"
    symbol = getattr(trade, "symbol", None) or "نماد ثبت‌نشده"
    return f"#{number} {symbol} ({fa_direction(getattr(trade, 'direction', None))})"


def _list_text(value: Any, limit: int = 6) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return _short(value, 160)
    if isinstance(value, dict):
        value = list(value.values())
    if isinstance(value, (list, tuple)):
        parts: list[str] = []
        for item in list(value)[:limit]:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("label") or item.get("name") or item))
            else:
                parts.append(str(item))
        return _short("، ".join(p for p in parts if p), 200)
    return _short(value, 160)


def _checklist_text(value: Any) -> str:
    """Turn ``checklist_ticks`` into ``۷ از ۹ مورد (رعایت‌نشده: …)``."""
    if not value:
        return "ثبت نشده"
    items: list[tuple[str, bool]] = []
    if isinstance(value, dict):
        for key, tick in value.items():
            items.append((str(key), bool(tick)))
    elif isinstance(value, (list, tuple)):
        for item in value:
            if isinstance(item, dict):
                text = str(item.get("text") or item.get("label") or item.get("id") or "آیتم")
                tick = bool(item.get("checked", item.get("done", item.get("value", False))))
                items.append((text, tick))
            else:
                items.append((str(item), True))
    if not items:
        return "ثبت نشده"
    done = [t for t, ok in items if ok]
    missed = [t for t, ok in items if not ok]
    out = f"{len(done)} از {len(items)} مورد"
    if missed:
        out += " — رعایت‌نشده: " + _short("، ".join(missed[:5]), 160)
    return out


def _take_profits(trade: Any) -> str:
    try:
        rows = list(getattr(trade, "take_profits", None) or [])
    except Exception:  # lazy relationship not loaded
        return ""
    if not rows:
        return ""
    try:
        rows.sort(key=lambda r: getattr(r, "order", 0) or 0)
    except Exception:
        pass
    parts = []
    for row in rows[:6]:
        price = _fmt(getattr(row, "price", None), 6)
        save = getattr(row, "save_percent", None)
        parts.append(f"TP{getattr(row, 'order', len(parts) + 1)} {price}" + (f" ({_fmt(save)}٪)" if save else ""))
    return "، ".join(parts)


# ---------------------------------------------------------------------------
# blocks
# ---------------------------------------------------------------------------
_DASH_FIELDS: list[tuple[str, str]] = [
    ("trade_count", "تعداد کل معاملات"),
    ("closed_count", "معاملات بسته‌شده"),
    ("win_rate", "وین‌ریت"),
    ("profit_factor", "فاکتور سود"),
    ("avg_rr", "میانگین R"),
    ("current_balance", "موجودی فعلی (دلار)"),
    ("max_drawdown", "حداکثر دراداون"),
    ("win_streak", "بلندترین زنجیرهٔ برد"),
    ("loss_streak", "بلندترین زنجیرهٔ باخت"),
    ("avg_leverage", "میانگین اهرم"),
    ("avg_leverage_long", "میانگین اهرم لانگ"),
    ("avg_leverage_short", "میانگین اهرم شورت"),
    ("checklist_discipline", "انضباط چک‌لیست"),
    ("usdt_irt", "نرخ تتر"),
]

_DASH_JSON_FIELDS: list[tuple[str, str, int]] = [
    ("win_loss", "تفکیک برد/باخت/سربه‌سر و میانگین آن‌ها", 700),
    ("direction_stats", "عملکرد بر حسب جهت", 700),
    ("session_stats", "عملکرد بر حسب سشن معاملاتی", 900),
    ("top_symbols", "سودده‌ترین نمادها", 700),
    ("worst_symbols", "زیان‌ده‌ترین نمادها", 700),
]


def dashboard_block(dash: Any) -> str:
    """Render **every** dashboard metric the site shows to the user."""
    if dash is None:
        return "## شاخص‌های داشبورد\nدر دسترس نبود."
    lines = ["## شاخص‌های داشبورد (همان اعدادی که کاربر در سایت می‌بیند)"]
    for key, label in _DASH_FIELDS:
        value = getattr(dash, key, None)
        if value is None:
            continue
        if key in {"win_rate", "checklist_discipline"} and isinstance(value, (int, float)):
            pct = float(value) * 100 if abs(float(value)) <= 1 else float(value)
            lines.append(f"- {label}: {_fmt(pct)}٪")
        else:
            lines.append(f"- {label}: {_fmt(value)}")
    for key, label, limit in _DASH_JSON_FIELDS:
        value = getattr(dash, key, None)
        if value:
            lines.append(f"- {label}: {_json(value, limit)}")
    equity = getattr(dash, "equity_curve", None)
    if equity:
        try:
            tail = list(equity)[-30:]
        except Exception:
            tail = equity
        lines.append(f"- منحنی سرمایه (۳۰ نقطهٔ آخر): {_json(tail, 1200)}")
    daily = getattr(dash, "pnl_by_day", None)
    if daily:
        try:
            tail = list(daily)[-30:]
        except Exception:
            tail = daily
        lines.append(f"- سود/زیان روزانه (۳۰ روز آخر): {_json(tail, 1200)}")
    return "\n".join(lines)


def plan_block(topics: Any) -> str:
    lines = ["## تریدینگ پلن کاربر (نوشتهٔ خودش در صفحهٔ تریدینگ پلن)"]
    rows = topics if isinstance(topics, list) else []
    if not rows:
        lines.append("کاربر هنوز تریدینگ پلنی ثبت نکرده است. در بخش مربوطه برایش یک پلن پایه بنویس.")
        return "\n".join(lines)
    for topic in rows[:20]:
        if not isinstance(topic, dict):
            continue
        title = str(topic.get("title") or "بدون عنوان")
        lines.append(f"### {title}")
        items = topic.get("items") or []
        if not isinstance(items, list) or not items:
            lines.append("- (این سرفصل خالی است)")
            continue
        for item in items[:25]:
            text = item.get("text") if isinstance(item, dict) else item
            if text:
                lines.append(f"- {_short(text, 300)}")
    return "\n".join(lines)


def checklists_block(rows: Iterable[Any]) -> str:
    lines = ["## چک‌لیست‌های کاربر"]
    found = False
    for row in rows or []:
        found = True
        title = getattr(row, "title", None) or "چک‌لیست"
        lines.append(f"### {title}")
        items = getattr(row, "items", None) or []
        if isinstance(items, list):
            for item in items[:30]:
                text = item.get("text") if isinstance(item, dict) else item
                if text:
                    lines.append(f"- {_short(text, 250)}")
    if not found:
        lines.append("کاربر چک‌لیستی ثبت نکرده است. یک چک‌لیست پیشنهادی برایش بنویس.")
    return "\n".join(lines)


def _pnl_percent(trade: Any) -> str:
    pnl = getattr(trade, "realized_pnl", None)
    base = getattr(trade, "balance_snapshot", None)
    if pnl is None or not base:
        return "-"
    try:
        return f"{(float(pnl) / float(base)) * 100:.2f}٪"
    except Exception:
        return "-"


def trade_detail(trade: Any, index: int | None = None) -> str:
    """Multi line description of a single trade, always starting with its name."""
    head = trade_label(trade)
    if index is not None:
        head = f"{index}. {head}"
    lines = [f"- {head}"]
    lines.append(
        "  تاریخ: " + _date(getattr(trade, "open_date", None))
        + " ← تا → " + _date(getattr(trade, "close_date", None))
        + " | وضعیت: " + str(getattr(trade, "status", "-") or "-")
        + " | منبع: " + str(getattr(trade, "source", "-") or "-")
        + " | سشن: " + str(session_for(getattr(trade, "open_date", None)) or "-")
    )
    lines.append(
        "  تایم‌فریم تحلیل/تریگر: " + str(getattr(trade, "analysis_tf", "-") or "-")
        + " / " + str(getattr(trade, "trigger_tf", "-") or "-")
        + " | اهرم: " + _fmt(getattr(trade, "leverage", None))
        + " | درصد مارجین: " + _fmt(getattr(trade, "margin_percent", None))
        + " | موجودی هنگام معامله: " + _fmt(getattr(trade, "balance_snapshot", None))
    )
    tps = _take_profits(trade)
    lines.append(
        "  ورود: " + _fmt(getattr(trade, "entry_price", None), 6)
        + " | حد ضرر: " + _fmt(getattr(trade, "stop_loss", None), 6)
        + (" | اهداف: " + tps if tps else " | اهداف: ثبت نشده")
    )
    lines.append(
        "  خروج: " + str(getattr(trade, "exit_type", "-") or "-")
        + " در " + _fmt(getattr(trade, "exit_price", None), 6)
        + " | R مورد انتظار: " + _fmt(getattr(trade, "rr_expected", None))
        + " | R کسب‌شده: " + _fmt(getattr(trade, "rr_achieved", None))
        + " | سود/زیان: " + _fmt(getattr(trade, "realized_pnl", None)) + " دلار (" + _pnl_percent(trade) + " موجودی)"
    )
    risk_free = getattr(trade, "is_risk_free_mgmt", None) or getattr(trade, "is_risk_free_plan", None)
    if risk_free:
        lines.append("  مدیریت: معامله ریسک‌فری شده بوده")
    entry_reasons = _list_text(getattr(trade, "entry_reasons", None))
    exit_reasons = _list_text(getattr(trade, "exit_reasons", None))
    if entry_reasons or exit_reasons:
        lines.append("  دلیل ورود: " + (entry_reasons or "-") + " | دلیل خروج: " + (exit_reasons or "-"))
    emotions = _list_text(getattr(trade, "emotions", None))
    tags = _list_text(getattr(trade, "tags", None))
    lines.append(
        "  احساسات: " + (emotions or "ثبت نشده")
        + " | برچسب‌ها: " + (tags or "-")
        + " | چک‌لیست: " + _checklist_text(getattr(trade, "checklist_ticks", None))
    )
    notes = []
    for attr, label in (("entry_note", "یادداشت ورود"), ("exit_note", "یادداشت خروج"), ("general_note", "یادداشت کلی")):
        value = _short(getattr(trade, attr, None), 200)
        if value:
            notes.append(f"{label}: {value}")
    if notes:
        lines.append("  " + " | ".join(notes))
    images = []
    if getattr(trade, "image_before", None):
        images.append("تصویر قبل از ورود ثبت شده")
    if getattr(trade, "image_after", None):
        images.append("تصویر خروج ثبت شده")
    lines.append("  تصاویر: " + ("، ".join(images) if images else "ثبت نشده"))
    return "\n".join(lines)


def trades_block(trades: list[Any], title: str) -> str:
    lines = [f"## {title} ({len(trades)} معامله)"]
    if not trades:
        lines.append("معامله‌ای ثبت نشده است.")
        return "\n".join(lines)
    lines.append("هر معامله با نام کامل آمده است؛ در گزارش هم دقیقاً با همین نام به آن ارجاع بده.")
    for index, trade in enumerate(trades, start=1):
        lines.append(trade_detail(trade, index))
    return "\n".join(lines)


def subset_stats_block(trades: list[Any]) -> str:
    """Aggregates computed only over the trades actually shown to the model."""
    closed = [t for t in trades if getattr(t, "realized_pnl", None) is not None]
    if not closed:
        return ""
    wins = [float(t.realized_pnl) for t in closed if float(t.realized_pnl or 0) > 0]
    losses = [float(t.realized_pnl) for t in closed if float(t.realized_pnl or 0) < 0]
    total = sum(float(t.realized_pnl or 0) for t in closed)
    gross_win = sum(wins)
    gross_loss = abs(sum(losses))
    avg_win = gross_win / len(wins) if wins else 0.0
    avg_loss = gross_loss / len(losses) if losses else 0.0
    win_rate = (len(wins) / len(closed)) * 100 if closed else 0.0
    expectancy = total / len(closed) if closed else 0.0
    pf = (gross_win / gross_loss) if gross_loss else None
    best = max(closed, key=lambda t: float(t.realized_pnl or 0))
    worst = min(closed, key=lambda t: float(t.realized_pnl or 0))
    rr_values = [float(getattr(t, "rr_achieved", 0) or 0) for t in closed if getattr(t, "rr_achieved", None) is not None]
    avg_rr = sum(rr_values) / len(rr_values) if rr_values else None
    lines = [
        "## آمار همین معاملاتی که بالا آمده (محاسبه‌شده، دوباره حساب نکن)",
        f"- معاملات بسته‌شده: {len(closed)} | برد: {len(wins)} | باخت: {len(losses)}",
        f"- وین‌ریت: {_fmt(win_rate)}٪ | جمع سود/زیان: {_fmt(total)} دلار",
        f"- میانگین برد: {_fmt(avg_win)} دلار | میانگین باخت: {_fmt(avg_loss)} دلار",
        f"- انتظار ریاضی هر معامله: {_fmt(expectancy)} دلار",
        f"- فاکتور سود: {_fmt(pf) if pf is not None else 'بدون زیان (بی‌نهایت)'}",
        f"- بهترین معامله: {trade_label(best)} با {_fmt(getattr(best, 'realized_pnl', None))} دلار",
        f"- بدترین معامله: {trade_label(worst)} با {_fmt(getattr(worst, 'realized_pnl', None))} دلار",
    ]
    if avg_rr is not None:
        lines.append(f"- میانگین R کسب‌شده: {_fmt(avg_rr)}")
    return "\n".join(lines)


def identity_block(user: Any, level_note: str = "") -> str:
    name = getattr(user, "display_name", None) or getattr(user, "username", None) or "معامله‌گر"
    tier = getattr(user, "subscription_tier", None) or "-"
    lines = [
        "## کاربر",
        f"- نام: {name}",
        f"- سطح اشتراک: {tier}",
        f"- موجودی ثبت‌شدهٔ کیف پول: {_fmt(getattr(user, 'wallet_margin', None))} دلار",
    ]
    if level_note:
        lines.append(f"- {level_note}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# public builders
# ---------------------------------------------------------------------------
def build_coach_context(
    *,
    user: Any,
    trades: list[Any],
    dash: Any,
    checklists: Iterable[Any],
    plan_topics: Any,
    level_note: str = "",
) -> str:
    parts = [
        identity_block(user, level_note),
        dashboard_block(dash),
        plan_block(plan_topics),
        checklists_block(checklists),
        subset_stats_block(trades),
        trades_block(trades, "معاملات اخیر کاربر"),
    ]
    return "\n\n".join(p for p in parts if p)


def build_trade_context(
    *,
    user: Any,
    trade: Any,
    recent_trades: list[Any],
    dash: Any,
    checklists: Iterable[Any],
    plan_topics: Any,
) -> str:
    parts = [
        identity_block(user),
        "## معامله‌ای که باید تحلیل کنی\n" + trade_detail(trade),
        plan_block(plan_topics),
        checklists_block(checklists),
        dashboard_block(dash),
    ]
    if recent_trades:
        parts.append(trades_block(recent_trades, "چند معاملهٔ اخیر (فقط برای درک سبک کاربر)"))
    return "\n\n".join(p for p in parts if p)


def build_institutional_context(
    *,
    user: Any,
    base_summary: str,
    trades: list[Any],
    dash: Any,
    checklists: Iterable[Any],
    plan_topics: Any,
) -> str:
    parts = [
        identity_block(user),
        base_summary or "",
        dashboard_block(dash),
        plan_block(plan_topics),
        checklists_block(checklists),
        trades_block(trades, "معاملات با نام کامل (برای استناد در گزارش)"),
    ]
    return "\n\n".join(p for p in parts if p)
