"""Cryptographic primitives. Nothing here invents crypto: it wires vetted libraries
(`cryptography`, `argon2-cffi`) with safe parameters.

- Field encryption: AES-256-GCM, random 96-bit nonce, associated data binds a ciphertext to its
  column so a value copied into another column fails to decrypt. Ciphertexts carry a key id for rotation.
- Blind index: HMAC-SHA256 over a normalised value, so encrypted columns (phone numbers) can still be
  looked up by exact match without storing the plaintext.
- Passwords: Argon2id (m=64 MiB, t=3, p=1), re-hashed automatically when parameters change.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from functools import lru_cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings

_FORMAT_VERSION = b"\x01"


class DecryptionError(Exception):
    pass


@lru_cache
def _aead_keys() -> dict[str, AESGCM]:
    return {kid: AESGCM(key) for kid, key in get_settings().encryption_keys.items()}


def encrypt(plaintext: bytes, *, context: str) -> bytes:
    """Encrypt and return `version | kid_len | kid | nonce | ciphertext+tag`."""
    settings = get_settings()
    kid = settings.field_encryption_active_kid.encode()
    nonce = secrets.token_bytes(12)
    ct = _aead_keys()[settings.field_encryption_active_kid].encrypt(nonce, plaintext, context.encode())
    return _FORMAT_VERSION + bytes([len(kid)]) + kid + nonce + ct


def decrypt(blob: bytes, *, context: str) -> bytes:
    try:
        if blob[:1] != _FORMAT_VERSION:
            raise DecryptionError("unknown ciphertext format")
        kid_len = blob[1]
        kid = blob[2 : 2 + kid_len].decode()
        nonce = blob[2 + kid_len : 14 + kid_len]
        ct = blob[14 + kid_len :]
        return _aead_keys()[kid].decrypt(nonce, ct, context.encode())
    except DecryptionError:
        raise
    except Exception as exc:  # noqa: BLE001 - never leak which step failed
        raise DecryptionError("decryption failed") from exc


def encrypt_str(value: str, *, context: str) -> bytes:
    return encrypt(value.encode(), context=context)


def decrypt_str(blob: bytes, *, context: str) -> str:
    return decrypt(blob, context=context).decode()


def _hmac(key_name: str, message: bytes) -> bytes:
    return hmac.new(get_settings().key_bytes(key_name), message, hashlib.sha256).digest()


def blind_index(value: str, *, purpose: str) -> bytes:
    """Deterministic keyed hash for exact-match lookups of encrypted values."""
    return _hmac("blind_index_key", f"{purpose}:{value}".encode())


def otp_digest(request_id: str, code: str) -> str:
    return _hmac("otp_hmac_key", f"{request_id}:{code}".encode()).hex()


def refresh_token_digest(token: str) -> str:
    return _hmac("refresh_token_pepper", token.encode()).hex()


def sign_cursor(payload: bytes) -> str:
    sig = _hmac("cursor_signing_key", payload)[:16]
    return base64.urlsafe_b64encode(payload + sig).decode().rstrip("=")


def verify_cursor(token: str) -> bytes | None:
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
    except Exception:  # noqa: BLE001
        return None
    payload, sig = raw[:-16], raw[-16:]
    if not hmac.compare_digest(sig, _hmac("cursor_signing_key", payload)[:16]):
        return None
    return payload


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def random_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def random_digits(length: int) -> str:
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


# --- Passwords ------------------------------------------------------------------------

_hasher = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=1, hash_len=32, salt_len=16)
# Verified against when the account does not exist, so response time does not reveal it.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(stored_hash: str | None, password: str) -> tuple[bool, str | None]:
    """Return (ok, new_hash). `new_hash` is set when the stored hash should be upgraded."""
    try:
        _hasher.verify(stored_hash or _DUMMY_HASH, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False, None
    if stored_hash is None:
        return False, None
    if _hasher.check_needs_rehash(stored_hash):
        return True, _hasher.hash(password)
    return True, None
