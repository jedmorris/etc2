"""
Per-user OAuth token encryption, storage, and refresh for etC2.

Tokens are encrypted at rest using AES-256-GCM.  The symmetric key
lives in ``TOKEN_ENCRYPTION_KEY`` and must be a 32-byte hex-encoded
string (64 hex chars).  Generate one with::

    python -c "import secrets; print(secrets.token_hex(32))"

The wire format matches the TypeScript layer (``crypto.ts``):
``base64(iv[12] + authTag[16] + ciphertext)``.

Legacy Fernet-encrypted tokens are auto-detected and decrypted as a
fallback so existing rows don't break during the migration window.

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
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv

import supabase_client as sb

load_dotenv()

# ---------------------------------------------------------------------------
# Encryption primitives  (AES-256-GCM, matching TS crypto.ts)
# ---------------------------------------------------------------------------

_aesgcm: AESGCM | None = None

IV_LENGTH = 12
TAG_LENGTH = 16


def _get_aesgcm() -> AESGCM:
    """Lazy-init an AESGCM instance from the hex-encoded env var."""
    global _aesgcm
    if _aesgcm is None:
        raw_key = os.environ["TOKEN_ENCRYPTION_KEY"]
        key_bytes = bytes.fromhex(raw_key)
        if len(key_bytes) != 32:
            raise ValueError(
                "TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)."
            )
        _aesgcm = AESGCM(key_bytes)
    return _aesgcm


def encrypt_token(plaintext: str) -> str:
    """Encrypt *plaintext* with AES-256-GCM.

    Returns base64(iv + authTag + ciphertext) matching the TS layer.
    """
    aesgcm = _get_aesgcm()
    iv = os.urandom(IV_LENGTH)
    # AESGCM.encrypt returns ciphertext + tag (tag appended)
    ct_and_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    ciphertext = ct_and_tag[:-TAG_LENGTH]
    tag = ct_and_tag[-TAG_LENGTH:]
    # TS format: iv (12) + tag (16) + ciphertext
    combined = iv + tag + ciphertext
    return base64.b64encode(combined).decode("utf-8")


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a base64-encoded *ciphertext* back to plaintext.

    Accepts the AES-256-GCM format (iv+tag+ct) produced by both
    this module and the TS ``encryptToken()``.  Falls back to
    legacy Fernet if the payload looks like a Fernet token.
    """
    raw = ciphertext.encode("utf-8")

    # --- Legacy Fernet fallback ---
    # Fernet tokens always start with "gAAAAA" (version byte 0x80
    # followed by 8-byte timestamp, base64-encoded).
    if raw.startswith(b"gAAAAA"):
        try:
            from cryptography.fernet import Fernet

            fernet_key = os.environ["TOKEN_ENCRYPTION_KEY"]
            # Fernet expects url-safe-base64 of 32 bytes.  If the key
            # is hex, convert it.
            try:
                f = Fernet(fernet_key.encode())
            except Exception:
                key_bytes = bytes.fromhex(fernet_key)
                f = Fernet(base64.urlsafe_b64encode(key_bytes))
            return f.decrypt(raw).decode("utf-8")
        except Exception:
            pass  # Fall through to AES-GCM attempt

    # --- AES-256-GCM (primary path) ---
    combined = base64.b64decode(raw)
    iv = combined[:IV_LENGTH]
    tag = combined[IV_LENGTH : IV_LENGTH + TAG_LENGTH]
    ct = combined[IV_LENGTH + TAG_LENGTH :]
    # AESGCM.decrypt expects ciphertext + tag
    plaintext_bytes = _get_aesgcm().decrypt(iv, ct + tag, None)
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
        "access_token_encrypted": encrypt_token(access_token),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if refresh_token is not None:
        payload["refresh_token_encrypted"] = encrypt_token(refresh_token)
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
        "access_token": decrypt_token(row["access_token_encrypted"]),
        "refresh_token": None,
        "expires_at": row.get("token_expires_at"),
    }

    if row.get("refresh_token_encrypted"):
        result["refresh_token"] = decrypt_token(row["refresh_token_encrypted"])

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
