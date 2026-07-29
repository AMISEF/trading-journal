"""Extra dashboard analytics shared by the user, admin and public-team dashboards.

Given a chronologically-ordered list of CLOSED trades and their realised PnLs
(plus the starting balance), compute the metrics the basic dashboard didn't
have: max drawdown, longest win/loss streaks (with their aggregate PnL),
per-direction win rates, and the best/worst symbols (each with a win rate).

This module also owns :func:`win_rate`, the single definition of win rate used
everywhere in the app — see its docstring for the rule.
"""

from __future__ import annotations

from typing import Any, Iterable


def is_win(pnl: float) -> bool:
    """سودده: هر معامله‌ای که با سودِ بزرگ‌تر از صفر بسته شده باشد.

    معامله‌ای که بخشی از آن سیو سود شده و بقیه ریسک‌فری (روی نقطهٔ ورود) بسته
    شده، سودِ همان بخشِ سیوشده را دارد، پس اینجا «سودده» است — نه سربه‌سر.
    """
    return pnl > 0


def is_loss(pnl: float) -> bool:
    return pnl < 0


def is_breakeven(pnl: float) -> bool:
    """سربه‌سر: معامله‌ای که نه سود داشته نه زیان و با صفر دلار بسته شده."""
    return pnl == 0


def win_rate(pnls: Iterable[float]) -> float | None:
    """وین‌ریت = تعداد سودده ÷ (تعداد سودده + تعداد زیان‌ده).

    معاملاتِ سربه‌سر (سود/زیانِ دقیقاً صفر) در مخرج نمی‌آیند، چون نه برد
    بوده‌اند نه باخت و نباید نسبت را رقیق کنند. اگر هیچ معاملهٔ برد/باختی نباشد
    (هیچ معامله‌ای یا فقط سربه‌سر) خروجی None است، یعنی «قابل محاسبه نیست».

    این تنها تعریفِ وین‌ریت در کلِ برنامه است؛ همهٔ داشبوردها، آمارِ جهت و نماد،
    و تحلیل‌های هوش مصنوعی از همین استفاده می‌کنند.
    """
    wins = losses = 0
    for p in pnls:
        if is_win(p):
            wins += 1
        elif is_loss(p):
            losses += 1
    decided = wins + losses
    return (wins / decided) if decided else None


def _streak(pnls: list[float], want_win: bool) -> dict:
    """Longest run of consecutive wins (or losses) and the sum of PnL in it."""
    best_len, best_sum = 0, 0.0
    cur_len, cur_sum = 0, 0.0
    for p in pnls:
        hit = (p > 0) if want_win else (p < 0)
        if hit:
            cur_len += 1
            cur_sum += p
            if cur_len > best_len:
                best_len, best_sum = cur_len, cur_sum
        else:
            cur_len, cur_sum = 0, 0.0
    return {"count": best_len, "pnl": best_sum}


def compute_extra(closed: list[Any], pnls: list[float], start_balance: float) -> dict:
    """Return the extra dashboard blocks. ``closed[i]`` pairs with ``pnls[i]``."""
    # --- Max drawdown over the running equity (peak-to-trough) ---
    bal = start_balance
    peak = start_balance
    max_dd = 0.0
    max_dd_pct = 0.0
    for p in pnls:
        bal += p
        if bal > peak:
            peak = bal
        dd = peak - bal
        if dd > max_dd:
            max_dd = dd
            max_dd_pct = (dd / peak * 100.0) if peak > 0 else 0.0
    max_drawdown = {"amount": max_dd, "percent": max_dd_pct}

    win_streak = _streak(pnls, True)
    loss_streak = _streak(pnls, False)

    # --- Per-direction win rates ---
    long_n = long_w = long_d = short_n = short_w = short_d = 0
    for t, p in zip(closed, pnls):
        if t.direction == "LONG":
            long_n += 1
            long_w += 1 if is_win(p) else 0
            long_d += 1 if not is_breakeven(p) else 0
        elif t.direction == "SHORT":
            short_n += 1
            short_w += 1 if is_win(p) else 0
            short_d += 1 if not is_breakeven(p) else 0
    # `long`/`short` stay the FULL counts (that is what the pie chart shows);
    # only the win-rate denominators drop the break-even trades.
    direction_stats = {
        "long": long_n,
        "short": short_n,
        "longWins": long_w,
        "shortWins": short_w,
        "longWinRate": (long_w / long_d) if long_d else None,
        "shortWinRate": (short_w / short_d) if short_d else None,
    }

    # --- Per-symbol PnL / count / win rate ---
    sym: dict[str, dict] = {}
    for t, p in zip(closed, pnls):
        s = t.symbol or "?"
        d = sym.setdefault(s, {"symbol": s, "pnl": 0.0, "count": 0, "wins": 0,
                               "decided": 0})
        d["pnl"] += p
        d["count"] += 1                       # همهٔ معاملات (ستون «تعداد»)
        d["wins"] += 1 if is_win(p) else 0
        d["decided"] += 0 if is_breakeven(p) else 1   # مخرجِ وین‌ریت
    for d in sym.values():
        d["winRate"] = (d["wins"] / d["decided"]) if d["decided"] else None
    by_pnl = sorted(sym.values(), key=lambda x: x["pnl"], reverse=True)
    top_symbols = by_pnl[:5]
    worst_symbols = list(reversed(by_pnl[-5:])) if len(by_pnl) > 5 else list(reversed(by_pnl))
    # Don't duplicate a symbol in both lists when there are very few.
    top_names = {s["symbol"] for s in top_symbols}
    worst_symbols = [s for s in worst_symbols if s["symbol"] not in top_names]

    return {
        "direction_stats": direction_stats,
        "top_symbols": top_symbols,
        "worst_symbols": worst_symbols,
        "max_drawdown": max_drawdown,
        "win_streak": win_streak,
        "loss_streak": loss_streak,
    }
