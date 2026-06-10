"""Detect which trading session a trade was opened in.

Sessions are based on the UTC hour of the open time. The four major FX/crypto
sessions overlap in reality; here we use simple, well-known UTC windows so the
dashboard can group trades. The order of checks matters because windows overlap.
"""

from __future__ import annotations

from datetime import datetime


def session_for(open_date: datetime | None) -> str | None:
    """Return "Sydney" | "Tokyo" | "London" | "New York" for the open hour (UTC).

    Returns None if no open date is available.
    """
    if open_date is None:
        return None

    hour = open_date.hour  # assumed UTC (the backend stores UTC everywhere)

    # Approximate session windows in UTC:
    #   Sydney:   22:00 - 07:00
    #   Tokyo:    00:00 - 09:00
    #   London:   07:00 - 16:00
    #   New York: 12:00 - 21:00
    # We pick the "most active" session for the hour using a priority order
    # (New York > London > Tokyo > Sydney) where windows overlap.
    if 12 <= hour < 21:
        return "New York"
    if 7 <= hour < 16:
        return "London"
    if 0 <= hour < 9:
        return "Tokyo"
    # Remaining hours (21, 22, 23, and the 9-12 gap) fall to Sydney/Tokyo edges.
    if hour >= 22 or hour < 7:
        return "Sydney"
    return "Tokyo"
