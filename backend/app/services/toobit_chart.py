"""Server-side trade chart images (SVG) with a long/short position overlay.

Given a symbol's candles plus the trade's entry / target / stop, render a
candlestick chart with a TradingView-style position tool drawn over the entry:
a green "profit" zone toward the target and a red "loss" zone toward the stop,
an entry line and a direction arrow — like the reference the user shared.

SVG is used deliberately: it needs no headless browser or native imaging libs,
stays crisp at any size, and is served straight from /uploads as an <img> src.
The pure builder :func:`render_position_svg` is unit-tested; :func:`save_chart`
just writes it to the uploads dir.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass

_W, _H = 900, 520
_PADL, _PADR, _PADT, _PADB = 8, 78, 16, 24


@dataclass
class Candle:
    t: int
    o: float
    h: float
    l: float
    c: float


def candles_from_klines(rows: list[list]) -> list[Candle]:
    """Parse Toobit /quote/v1/klines rows into candles, defensively."""
    out: list[Candle] = []
    for r in rows or []:
        try:
            out.append(Candle(int(r[0]), float(r[1]), float(r[2]), float(r[3]), float(r[4])))
        except (IndexError, TypeError, ValueError):
            continue
    return out


def _esc(v: object) -> str:
    return str(v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_position_svg(
    symbol: str,
    direction: str,
    candles: list[Candle],
    *,
    entry: float,
    target: float | None = None,
    stop: float | None = None,
    exit_price: float | None = None,
    mode: str = "entry",
) -> str:
    """Return an SVG string of the candles with the position overlay.

    ``mode`` is "entry" or "exit" (only affects the caption/marker). Prices that
    are None are simply not drawn. Works for LONG and SHORT (the profit/loss
    zones flip for shorts).
    """
    is_long = (direction or "LONG").upper() == "LONG"
    prices = [p for c in candles for p in (c.h, c.l)]
    for p in (entry, target, stop, exit_price):
        if p:
            prices.append(p)
    if not prices:
        prices = [entry or 1.0]
    pmin, pmax = min(prices), max(prices)
    if pmax <= pmin:
        pmax = pmin * 1.01 + 1e-9
    span = (pmax - pmin) * 1.08
    mid = (pmax + pmin) / 2
    lo, hi = mid - span / 2, mid + span / 2

    plot_w = _W - _PADL - _PADR
    plot_h = _H - _PADT - _PADB

    def y(price: float) -> float:
        return _PADT + (hi - price) / (hi - lo) * plot_h

    n = max(len(candles), 1)
    cw = plot_w / n
    body = max(1.0, cw * 0.62)

    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_W} {_H}" '
        f'font-family="system-ui,Segoe UI,Roboto,sans-serif">'
    )
    parts.append(f'<rect width="{_W}" height="{_H}" fill="#0e1420"/>')

    # candles
    for i, c in enumerate(candles):
        cx = _PADL + i * cw + cw / 2
        up = c.c >= c.o
        col = "#26a69a" if up else "#ef5350"
        parts.append(
            f'<line x1="{cx:.1f}" y1="{y(c.h):.1f}" x2="{cx:.1f}" y2="{y(c.l):.1f}" '
            f'stroke="{col}" stroke-width="1"/>'
        )
        yo, yc = y(c.o), y(c.c)
        parts.append(
            f'<rect x="{cx - body / 2:.1f}" y="{min(yo, yc):.1f}" width="{body:.1f}" '
            f'height="{max(1.0, abs(yc - yo)):.1f}" fill="{col}"/>'
        )

    # --- position overlay (green profit zone / red loss zone around entry) ---
    y_entry = y(entry)
    tp = target if target else (exit_price if (exit_price and (
        (exit_price > entry) if is_long else (exit_price < entry))) else None)
    profit_to = y(tp) if tp else None
    loss_to = y(stop) if stop else None

    def zone(y_from: float, y_to: float, fill: str) -> str:
        top, h = min(y_from, y_to), abs(y_to - y_from)
        return (f'<rect x="{_PADL}" y="{top:.1f}" width="{plot_w:.1f}" '
                f'height="{h:.1f}" fill="{fill}"/>')

    if profit_to is not None:
        parts.append(zone(y_entry, profit_to, "rgba(38,166,154,0.16)"))
    if loss_to is not None:
        parts.append(zone(y_entry, loss_to, "rgba(239,83,80,0.16)"))

    # entry line + label
    parts.append(
        f'<line x1="{_PADL}" y1="{y_entry:.1f}" x2="{_PADL + plot_w:.1f}" '
        f'y2="{y_entry:.1f}" stroke="#5b9cf6" stroke-width="1.4" stroke-dasharray="5 3"/>'
    )
    # direction arrow near the last third
    ax = _PADL + plot_w * 0.5
    if tp:
        parts.append(
            f'<line x1="{ax:.1f}" y1="{y_entry:.1f}" x2="{ax:.1f}" y2="{y(tp):.1f}" '
            f'stroke="#5b9cf6" stroke-width="2"/>'
        )
        head = -6 if (y(tp) < y_entry) else 6
        parts.append(
            f'<path d="M{ax - 5:.1f},{y(tp) - head:.1f} L{ax + 5:.1f},{y(tp) - head:.1f} '
            f'L{ax:.1f},{y(tp):.1f} Z" fill="#5b9cf6"/>'
        )

    # price axis labels (right)
    def label(price: float, color: str, text: str | None = None) -> str:
        yy = y(price)
        return (
            f'<rect x="{_W - _PADR + 2}" y="{yy - 9:.1f}" width="{_PADR - 6}" height="18" '
            f'rx="3" fill="{color}"/>'
            f'<text x="{_W - 6}" y="{yy + 4:.1f}" fill="#fff" font-size="11" '
            f'text-anchor="end">{_esc(text or _fmt(price))}</text>'
        )

    parts.append(label(entry, "#3a5a8c"))
    if tp:
        parts.append(label(tp, "#1a7f68"))
    if stop:
        parts.append(label(stop, "#a12f2c"))

    # header caption
    tag = "ورود" if mode == "entry" else "خروج"
    side_fa = "لانگ" if is_long else "شورت"
    parts.append(
        f'<text x="{_PADL}" y="12" fill="#cbd5e1" font-size="13" font-weight="700">'
        f'{_esc(symbol)} · {side_fa} · {tag}</text>'
    )
    parts.append("</svg>")
    return "".join(parts)


def _fmt(p: float) -> str:
    if p >= 100:
        return f"{p:.2f}"
    if p >= 1:
        return f"{p:.4f}"
    return f"{p:.6f}".rstrip("0").rstrip(".")


def save_chart(uploads_dir: str, svg: str) -> str:
    """Write the SVG to the uploads dir and return its /uploads/<name> URL."""
    os.makedirs(uploads_dir, exist_ok=True)
    name = f"toobit_{uuid.uuid4().hex}.svg"
    with open(os.path.join(uploads_dir, name), "w", encoding="utf-8") as f:
        f.write(svg)
    return f"/uploads/{name}"
