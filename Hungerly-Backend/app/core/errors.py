"""RFC 9457 Problem Details errors with stable machine-readable codes.

Error responses never contain stack traces, SQL, or internal identifiers.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("hungerly.errors")

_TITLES = {
    400: "Bad request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not found",
    405: "Method not allowed",
    409: "Conflict",
    410: "Gone",
    413: "Payload too large",
    415: "Unsupported media type",
    422: "Validation failed",
    423: "Locked",
    429: "Too many requests",
    500: "Internal server error",
    503: "Service unavailable",
}


class ProblemError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        detail: str | None = None,
        *,
        errors: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
        extra: dict[str, Any] | None = None,
    ):
        super().__init__(code)
        self.status = status
        self.code = code
        self.detail = detail
        self.errors = errors
        self.headers = headers
        self.extra = extra


def problem_response(
    request: Request,
    status: int,
    code: str,
    detail: str | None = None,
    *,
    errors: list[dict[str, Any]] | None = None,
    headers: dict[str, str] | None = None,
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"https://docs.hungerly.app/errors/{code.replace('.', '-').replace('_', '-')}",
        "title": _TITLES.get(status, "Error"),
        "status": status,
        "code": code,
        "request_id": getattr(request.state, "request_id", None),
    }
    if detail:
        body["detail"] = detail
    if errors:
        body["errors"] = errors
    if extra:
        body.update(extra)
    return JSONResponse(body, status_code=status, headers=headers, media_type="application/problem+json")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemError)
    async def _problem(request: Request, exc: ProblemError) -> JSONResponse:
        return problem_response(
            request, exc.status, exc.code, exc.detail, errors=exc.errors, headers=exc.headers, extra=exc.extra
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = []
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path", "header")]
            # Never echo the rejected input back: it may contain secrets (passwords, OTPs).
            errors.append({"field": ".".join(loc) or None, "code": err.get("type"), "message": err.get("msg")})
        return problem_response(request, 422, "validation.failed", errors=errors)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "route.not_found", 405: "route.method_not_allowed"}.get(exc.status_code, "http.error")
        return problem_response(request, exc.status_code, code, headers=getattr(exc, "headers", None))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error", extra={"request_id": getattr(request.state, "request_id", None)})
        return problem_response(request, 500, "internal.error")
