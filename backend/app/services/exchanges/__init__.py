"""Multi-exchange adapter registry.

Every supported futures exchange is described by an :class:`ExchangeMeta`
entry.  The registry is the single source of truth shared by:

* ``app/api/exchanges.py``    -> REST routes (list / set key / sync / debug)
* ``app/services/exchange_sync.py`` -> the generic 60s sync worker
* the frontend (``frontend/src/lib/exchanges.ts`` mirrors ``slug``/``color``)

``toobit`` is listed here too so the UI can render all exchanges from one
list, but it keeps using the legacy ``users.toobit_*`` columns and the
battle-tested ``app/services/toobit_sync.py`` worker.  ``client_cls`` is
``None`` for it on purpose.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Type

from .base import BaseExchangeClient, ExchangeError
from .lbank import LbankClient
from .ourbit import OurbitClient
from .weex import WeexClient
from .xt import XtClient


@dataclass(frozen=True)
class ExchangeMeta:
    slug: str
    label: str
    color: str
    needs_passphrase: bool = False
    legacy: bool = False
    client_cls: Optional[Type[BaseExchangeClient]] = None
    base_env: Optional[str] = None
    default_base: Optional[str] = None
    docs_url: str = ""

    @property
    def base_url(self) -> Optional[str]:
        if self.base_env:
            value = (os.getenv(self.base_env) or "").strip()
            if value:
                return value.rstrip("/")
        return self.default_base


#: Ordered — the frontend renders the cards in this order.
EXCHANGES: Dict[str, ExchangeMeta] = {
    "toobit": ExchangeMeta(
        slug="toobit",
        label="Toobit",
        color="#F5C542",
        legacy=True,
        client_cls=None,
        docs_url="https://toobit-docs.github.io/",
    ),
    "lbank": ExchangeMeta(
        slug="lbank",
        label="LBank",
        color="#00C8B4",
        client_cls=LbankClient,
        base_env="LBANK_BASE_URL",
        default_base="https://lbkperp.lbank.com",
        docs_url="https://www.lbank.com/docs/contract.html",
    ),
    "xt": ExchangeMeta(
        slug="xt",
        label="XT.COM",
        color="#0052FF",
        client_cls=XtClient,
        base_env="XT_BASE_URL",
        default_base="https://fapi.xt.com",
        docs_url="https://doc.xt.com/",
    ),
    "ourbit": ExchangeMeta(
        slug="ourbit",
        label="Ourbit",
        color="#7B4DFF",
        client_cls=OurbitClient,
        base_env="OURBIT_BASE_URL",
        default_base="https://futures.ourbit.com",
        docs_url="https://www.ourbit.com/",
    ),
    "weex": ExchangeMeta(
        slug="weex",
        label="WEEX",
        color="#00E0A1",
        needs_passphrase=True,
        client_cls=WeexClient,
        base_env="WEEX_BASE_URL",
        default_base="https://api-contract.weex.com",
        docs_url="https://www.weex.com/api-doc/contract/intro",
    ),
}

#: Slugs handled by the generic adapter framework (everything but Toobit).
GENERIC_SLUGS: List[str] = [m.slug for m in EXCHANGES.values() if not m.legacy]
ALL_SLUGS: List[str] = list(EXCHANGES.keys())


def get_meta(slug: str) -> Optional[ExchangeMeta]:
    return EXCHANGES.get((slug or "").strip().lower())


def is_supported(slug: str) -> bool:
    return get_meta(slug) is not None


def public_meta() -> List[dict]:
    """Serialisable metadata for the settings UI."""
    out: List[dict] = []
    for meta in EXCHANGES.values():
        out.append(
            {
                "slug": meta.slug,
                "label": meta.label,
                "color": meta.color,
                "needsPassphrase": meta.needs_passphrase,
                "legacy": meta.legacy,
                "docsUrl": meta.docs_url,
            }
        )
    return out


def build_client(
    slug: str,
    api_key: str,
    secret_key: str,
    passphrase: Optional[str] = None,
) -> BaseExchangeClient:
    """Instantiate the adapter for ``slug``.

    Raises :class:`ExchangeError` (Persian message) when the exchange is
    unknown, has no generic adapter, or a required passphrase is missing.
    """
    meta = get_meta(slug)
    if meta is None:
        raise ExchangeError(f"صرافی پشتیبانی نمی‌شود: {slug}")
    if meta.client_cls is None:
        raise ExchangeError(f"برای صرافی {meta.label} از سرویس اختصاصی استفاده کنید.")
    if meta.needs_passphrase and not (passphrase or "").strip():
        raise ExchangeError(f"برای صرافی {meta.label} وارد کردن Passphrase الزامی است.")
    return meta.client_cls(
        api_key=api_key,
        secret_key=secret_key,
        passphrase=(passphrase or None),
        base_url=meta.base_url,
    )


def client_for_credential(credential) -> BaseExchangeClient:
    """Build a client from an :class:`ExchangeCredential` row.

    The row stores encrypted values; decryption happens here so callers never
    have to touch ``app.core.crypto`` directly.
    """
    from app.core.crypto import decrypt

    api_key = decrypt(credential.api_key_enc) or ""
    secret_key = decrypt(credential.secret_key_enc) or ""
    passphrase = decrypt(credential.passphrase_enc) if credential.passphrase_enc else None
    if not api_key or not secret_key:
        raise ExchangeError("کلید API ذخیره‌شده معتبر نیست. لطفاً دوباره ثبت کنید.")
    return build_client(credential.exchange, api_key, secret_key, passphrase)


__all__ = [
    "ALL_SLUGS",
    "EXCHANGES",
    "GENERIC_SLUGS",
    "BaseExchangeClient",
    "ExchangeError",
    "ExchangeMeta",
    "build_client",
    "client_for_credential",
    "get_meta",
    "is_supported",
    "public_meta",
]
