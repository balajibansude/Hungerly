from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.deps import PUBLIC
from app.api.routes import admin, admin_people, auth, catalog, customer, delivery
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.middleware import SecurityMiddleware
from app.core.redis import close_redis, get_redis
from app.db.session import dispose_engine, get_engine
from app.services.dispatch import run_sweeper

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop = asyncio.Event()
    sweeper = None
    if app.state.run_background_jobs:
        sweeper = asyncio.create_task(run_sweeper(stop))
    try:
        yield
    finally:
        stop.set()
        if sweeper:
            await sweeper
        await close_redis()
        await dispose_engine()


def create_app(*, run_background_jobs: bool = True) -> FastAPI:
    settings = get_settings()
    docs = not settings.is_production_like
    app = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
    )
    app.state.run_background_jobs = run_background_jobs
    install_error_handlers(app)

    for module in (auth, customer, catalog, delivery, admin, admin_people):
        app.include_router(module.router, prefix=settings.api_prefix)

    @app.get("/health/live", openapi_extra={PUBLIC: True})
    async def live() -> dict:
        return {"status": "ok"}

    @app.get("/health/ready", openapi_extra={PUBLIC: True})
    async def ready() -> JSONResponse:
        try:
            async with get_engine().connect() as conn:
                await conn.execute(text("SELECT 1"))
            await get_redis().ping()
        except Exception:  # noqa: BLE001 - health output must not leak details
            return JSONResponse({"status": "unavailable"}, status_code=503)
        return JSONResponse({"status": "ok"})

    # Order matters: CORS is inside the security middleware so rejected requests still get security headers.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=[
            "Authorization", "Content-Type", "Idempotency-Key", "If-Match", "X-CSRF-Token", "X-Request-ID",
            "X-Client-App", "X-Client-Version", "X-Platform",
        ],
        expose_headers=["X-Request-ID", "Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
        max_age=600,
    )
    app.add_middleware(SecurityMiddleware)
    return app


app = create_app()
