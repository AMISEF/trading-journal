"""Reversible encryption for sensitive secrets stored at rest (e.g. a user's
exchange API key).

We need the *plaintext* back later to call the exchange on the user's behalf, so
this is symmetric authenticated encryption (Fernet / AES-128-CBC + HMAC) — not a
one-way password hash. The key is derived from ``SECRET_KEY`` so no extra env var
is required, but that also means ``SECRET_KEY`` must be a long random value in
production and kept off the repo (it already signs the JWTs).

Only ``has_key`` / a masked preview is ever exposed by the API; the decrypted key
never leaves the server except in an outbound request to the exchange.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _fernet() -> Fernet:
    # Fernet needs a urlsafe-base64-encoded 32-byte key; derive it deterministically
    # from SECRET_KEY so the same server can always decrypt what it encrypted.
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(plaintext: str) -> str:
    """Encrypt a secret for storage. Returns an opaque token string."""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(token: str | None) -> str | None:
    """Return the original secret, or None if missing/tampered/undecryptable."""
    if not token:
        return None
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        return None


def mask(secret: str | None) -> str | None:
    """A safe preview for the UI: only the last 4 characters, rest hidden.

    e.g. "…6vH4AuDFGITyZw61cRJHSxtT" -> "••••••••SxtT". Never reveals the key.
    """
    if not secret:
        return None
    tail = secret[-4:]
    return "•" * 8 + tail
