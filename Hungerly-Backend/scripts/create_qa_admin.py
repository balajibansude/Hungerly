"""Development only: create (or reset) a super-admin used by the admin panel's automated UI tests.

Writes the credentials, including the TOTP secret, to a git-ignored JSON file so Playwright can sign in
with real two-factor authentication. Refuses to run against staging/production.

Usage: python scripts/create_qa_admin.py --out ../Hungerly-AdminPannel-Website/.qa-admin.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import secrets
import sys
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pyotp  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.core import crypto  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.db.session import dispose_engine, sessionmaker  # noqa: E402
from app.models import AdminProfile, User, UserRole  # noqa: E402

EMAIL = "qa-bot@hungerly.app"


async def main(out: Path) -> None:
    if get_settings().is_production_like:
        sys.exit("refusing to create a QA admin outside development")
    password = secrets.token_urlsafe(18)
    totp_secret = pyotp.random_base32(32)
    async with sessionmaker()() as db:
        user = (await db.execute(select(User).where(User.email == EMAIL))).scalar_one_or_none()
        if user is None:
            user = User(email=EMAIL, full_name="QA Bot", roles=[])
            user.roles.append(UserRole(role="admin"))
            db.add(user)
            await db.flush()
            db.add(AdminProfile(user_id=user.id, admin_role="super_admin"))
            await db.flush()
        user.password_hash = crypto.hash_password(password)
        user.status = "active"
        profile = await db.get(AdminProfile, user.id)
        assert profile is not None
        profile.admin_role = "super_admin"
        profile.is_active = True
        profile.totp_secret = totp_secret
        profile.totp_enabled_at = datetime.now(UTC)
        await db.commit()
    await dispose_engine()
    out.write_text(json.dumps({"email": EMAIL, "password": password, "totp_secret": totp_secret}), encoding="utf-8")
    print(f"QA admin ready -> {out}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True, type=Path)
    asyncio.run(main(p.parse_args().out))
