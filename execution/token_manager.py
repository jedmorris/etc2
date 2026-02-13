"""
Per-user OAuth token encryption, storage, and refresh for etC2.

Tokens are encrypted at rest using Fernet (AES-128-CBC under the hood,
with HMAC-SHA256 authentication -- effectively AES-256 total key
material).  The symmetric key lives in ``TOKEN_ENCRYPTION_KEY`` and
must be a valid Fernet key (32 bytes, url-safe base64-encoded via
``Fernet.generate_key()``).

Typical flow
------------
1. OAuth callback receives tokens -> ``store_tokens(...)`` encrypts
   and upserts into ``connected_accounts``.
2. Sync worker calls ``load_tokens(...)`` to decrypt before making
   API calls.
3. If the access token is expired, the worker calls
   ``refresh_etsy_token(...)`` or ``refresh_shopify_token(...)``
   which hits the provider, stores the new tokens, and returns them.
"""

from __future__ import annotations

import base64
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv

import supabase_client as sb

load_dotenv()

# ---------------------------------------------------------------------------
# Encryption primitives
# ---------------------------------------------------------------------------

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Lazy-init a Fernet instance from the env var."""
    global _fernet
    if _fernet is None:
        raw_key = os.environ["TOKEN_ENCRYPTION_KEY"]
        # Accept either a raw Fernet key or a plain base64-encoded
        # 32-byte key.  Fernet keys are already url-safe base64.
        try:
            _fernet = Fernet(raw_key.encode())
        except (ValueError, Exception):
            # Caller may have set a plain 32-byte base64 value.
            # Fernet expects url-safe base64 of 32 bytes (= 44 chars).
            decoded = base64.urlsafe_b64decode(raw_key)
            if len(decoded) != 32:
                raise ValueError(
                    "TOKEN_ENCRYPTION_KEY must be a 32-byte key "
                    "encoded as url-safe base64 (use Fernet.generate_key())."
                )
            _fernet = Fernet(base64.urlsafe_b64encode(decoded))
    return _fernet


def encrypt_token(plaintext: str) -> str:
    """Encrypt *plaintext* and return a base64-encoded ciphertext string."""
    token_bytes = _get_fernet().encrypt(plaintext.encode("utf-8"))
    return token_bytes.decode("utf-8")


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a base64-encoded *ciphertext* back to plaintext.

    Raises ``cryptography.fernet.InvalidToken`` if the key is wrong
    or the data has been tampered with.
    """
    plaintext_bytes = _get_fernet().decrypt(ciphertext.encode("utf-8"))
    return plaintext_bytes.decode("utf-8")


# ---------------------------------------------------------------------------
# Supabase persistence
# ---------------------------------------------------------------------------


def store_tokens(
    user_id: str,
    platform: str,
    access_token: str,
    refresh_token: str | None = None,
    expires_at: str | None = None,
) -> dict[str, Any]:
    """Encrypt tokens and upsert into ``connected_accounts``.

    Parameters
    ----------
    user_id:
        The tenant who owns these credentials.
    platform:
        "etsy" | "shopify" etc.
    access_token:
        The OAuth access token (plaintext -- will be encrypted).
    refresh_token:
        The OAuth refresh token (plaintext, optional).
    expires_at:
        ISO-8601 datetime string when the access token expires.

    Returns the upserted row (tokens stored encrypted).
    """
    payload: dict[str, Any] = {
        "user_id": user_id,
        "platform": platform,
        "access_token_enc": encrypt_token(access_token),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if refresh_token is not None:
        payload["refresh_token_enc"] = encrypt_token(refresh_token)
    if expires_at is not None:
        payload["token_expires_at"] = expires_at

    resp = (
        sb.get_client()
        .table("connected_accounts")
        .upsert(payload, on_conflict="user_id,platform")
        .execute()
    )
    return resp.data[0] if resp.data else payload


def load_tokens(user_id: str, platform: str) -> dict[str, Any] | None:
    """Load and decrypt tokens from ``connected_accounts``.

    Returns a dict with keys ``access_token``, ``refresh_token``
    (may be None), and ``expires_at`` (may be None).
    Returns None if no connected account exists.
    """
    row = sb.get_connected_account(user_id, platform)
    if row is None:
        return None

    result: dict[str, Any] = {
        "user_id": user_id,
        "platform": platform,
        "access_token": decrypt_token(row["access_token_enc"]),
        "refresh_token": None,
        "expires_at": row.get("token_expires_at"),
    }

    if row.get("refresh_token_enc"):
        result["refresh_token"] = decrypt_token(row["refresh_token_enc"])

    return result


def is_token_expired(expires_at: str | None) -> bool:
    """Return True if the token's expiry has passed (or is missing)."""
    if expires_at is None:
        return True
    try:
        exp = datetime.fromisoformat(expires_at)
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= exp
    except (ValueError, TypeError):
        return True


# ---------------------------------------------------------------------------
# Platform-specific refresh flows
# ---------------------------------------------------------------------------


def refresh_etsy_token(user_id: str) -> dict[str, Any]:
    """Use the stored refresh token to obtain a new Etsy access token.

    Etsy v3 OAuth2 refresh endpoint:
        POST https://api.etsy.com/v3/public/oauth/token

    On success, stores the new tokens and returns a dict with
    ``access_token``, ``refresh_token``, ``expires_at``.

    Raises ``RuntimeError`` on failure.
    """
    tokens = load_tokens(user_id, "etsy")
    if tokens is None or tokens["refresh_token"] is None:
        raise RuntimeError(
            f"No Etsy refresh token found for user {user_id}"
        )

    api_key = os.environ["ETSY_API_KEY"]

    resp = httpx.post(
        "https://api.etsy.com/v3/public/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": api_key,
            "refresh_token": tokens["refresh_token"],
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )

    if resp.status_code != 200:
        raise RuntimeError(
            f"Etsy token refresh failed ({resp.status_code}): {resp.text}"
        )

    data = resp.json()
    new_access = data["access_token"]
    new_refresh = data["refresh_token"]
    expires_in: int = data.get("expires_in", 3600)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    ).isoformat()

    store_tokens(
        user_id=user_id,
        platform="etsy",
        access_token=new_access,
        refresh_token=new_refresh,
        expires_at=expires_at,
    )

    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "expires_at": expires_at,
    }


def refresh_shopify_token(user_id: str) -> dict[str, Any]:
    """Refresh a Shopify OAuth access token.

    Shopify *custom apps* use permanent tokens that never expire.
    Shopify *public/custom OAuth apps* use the standard OAuth2
    token-exchange flow but the access tokens are **offline** and
    also do not expire.

    If a future Shopify flow adds expiring tokens, this function
    handles the refresh via:
        POST https://{shop}/admin/oauth/access_token

    For now it simply reloads the stored (non-expiring) token and
    returns it.  If the token is missing, raises ``RuntimeError``.
    """
    tokens = load_tokens(user_id, "shopify")
    if tokens is None:
        raise RuntimeError(
            f"No Shopify token found for user {user_id}"
        )

    # If the token has an expiry and it has passed, attempt refresh.
    if tokens.get("refresh_token") and is_token_expired(tokens.get("expires_at")):
        # Retrieve the shop domain from the connected_accounts row.
        account = sb.get_connected_account(user_id, "shopify")
        shop_domain: str | None = (account or {}).get("shop_domain")
        if not shop_domain:
            raise RuntimeError(
                f"No shop_domain stored for user {user_id}; cannot refresh."
            )

        api_key = os.environ["SHOPIFY_API_KEY"]
        api_secret = os.environ["SHOPIFY_API_SECRET"]

        resp = httpx.post(
            f"https://{shop_domain}/admin/oauth/access_token",
            json={
                "client_id": api_key,
                "client_secret": api_secret,
                "grant_type": "refresh_token",
                "refresh_token": tokens["refresh_token"],
            },
            timeout=30,
        )

        if resp.status_code != 200:
            raise RuntimeError(
                f"Shopify token refresh failed ({resp.status_code}): "
                f"{resp.text}"
            )

        data = resp.json()
        new_access = data["access_token"]
        expires_at = data.get("expires_at")

        store_tokens(
            user_id=user_id,
            platform="shopify",
            access_token=new_access,
            refresh_token=tokens["refresh_token"],
            expires_at=expires_at,
        )

        return {
            "access_token": new_access,
            "refresh_token": tokens["refresh_token"],
            "expires_at": expires_at,
        }

    # Token is still valid (or non-expiring) -- just return it.
    return tokens


def ensure_valid_token(user_id: str, platform: str) -> dict[str, Any]:
    """High-level convenience: load tokens, refresh if expired, return.

    This is the function sync workers should call before every API
    session.  It is idempotent and safe to call frequently.
    """
    tokens = load_tokens(user_id, platform)
    if tokens is None:
        raise RuntimeError(
            f"No {platform} tokens found for user {user_id}"
        )

    if not is_token_expired(tokens.get("expires_at")):
        return tokens

    if platform == "etsy":
        return refresh_etsy_token(user_id)
    elif platform == "shopify":
        return refresh_shopify_token(user_id)
    else:
        raise RuntimeError(f"Token refresh not implemented for {platform}")
