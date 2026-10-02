from __future__ import annotations

import unicodedata
from typing import Annotated, Generic, TypeVar

import phonenumbers
from pydantic import AfterValidator, BaseModel, ConfigDict, Field

T = TypeVar("T")


class Strict(BaseModel):
    """Request base: unknown fields rejected (no mass assignment), strings trimmed."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Money(BaseModel):
    amount_minor: int
    currency: str = "INR"


def money(amount_minor: int) -> Money:
    return Money(amount_minor=amount_minor)


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None


def _normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value)
    # Drop control characters (keeps normal spaces); collapse inner whitespace runs.
    value = "".join(ch for ch in value if unicodedata.category(ch)[0] != "C" or ch == " ")
    return " ".join(value.split())


def _phone(value: str) -> str:
    try:
        parsed = phonenumbers.parse(value, "IN")
    except phonenumbers.NumberParseException as exc:
        raise ValueError("invalid phone number") from exc
    if not phonenumbers.is_valid_number(parsed) or parsed.country_code != 91:
        raise ValueError("only valid Indian mobile numbers are supported")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


CleanText = Annotated[str, AfterValidator(_normalize_text)]
PhoneE164 = Annotated[str, Field(min_length=8, max_length=20), AfterValidator(_phone)]
Name = Annotated[CleanText, Field(min_length=1, max_length=120)]
ShortText = Annotated[CleanText, Field(max_length=300)]
DeviceId = Annotated[str, Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")]


class LatLng(Strict):
    lat: float = Field(ge=6.0, le=38.0)  # bounding box of India
    lng: float = Field(ge=68.0, le=98.0)


def mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return email
    local, domain = email.split("@", 1)
    return f"{local[:1]}{'•' * max(3, len(local) - 1)}@{domain}"


def mask_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    return phone[:3] + "•" * (len(phone) - 7) + phone[-4:]
