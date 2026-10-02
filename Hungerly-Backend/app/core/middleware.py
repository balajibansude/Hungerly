"""Pure-ASGI middleware: request ids, client IP resolution, body size limit,
global per-IP rate limit and security headers."""

from __future__ import annotations

import ipaddress
import re
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core import ratelimit
from app.core.config import get_settings
from app.core.errors import ProblemError, problem_response

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "Cache-Control": "no-store",
}


def _resolve_client_ip(scope: Scope, headers: Headers) -> str:
    peer = scope.get("client")
    peer_ip = peer[0] if peer else "unknown"
    trusted = get_settings().trusted_proxy_list
    if peer_ip in trusted:
        forwarded = headers.get("x-forwarded-for", "")
        # Walk from the right: the first address not belonging to a trusted proxy is the client.
        for candidate in reversed([p.strip() for p in forwarded.split(",") if p.strip()]):
            if candidate not in trusted:
                try:
                    return str(ipaddress.ip_address(candidate))
                except ValueError:
                    break
    return peer_ip


class SecurityMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app
        settings = get_settings()
        self.max_body = settings.max_body_bytes
        self.global_limit = settings.global_rate_limit_per_minute
        self.hsts = settings.is_production_like

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        incoming_id = headers.get("x-request-id", "")
        request_id = incoming_id if _REQUEST_ID_RE.match(incoming_id) else uuid.uuid4().hex
        client_ip = _resolve_client_ip(scope, headers)
        state = scope.setdefault("state", {})
        state["request_id"] = request_id
        state["client_ip"] = client_ip
        request = Request(scope)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                h = MutableHeaders(scope=message)
                for k, v in SECURITY_HEADERS.items():
                    h.setdefault(k, v)
                if self.hsts:
                    h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
                h["X-Request-ID"] = request_id
                if "server" in h:
                    del h["server"]
            await send(message)

        content_length = headers.get("content-length")
        if content_length is not None:
            if not content_length.isdigit() or int(content_length) > self.max_body:
                await problem_response(request, 413, "request.too_large")(scope, receive, send_wrapper)
                return

        if not scope["path"].startswith("/health"):
            try:
                await ratelimit.enforce(f"global:ip:{client_ip}", limit=self.global_limit, window_seconds=60)
            except ProblemError as exc:
                await problem_response(request, exc.status, exc.code, exc.detail, headers=exc.headers)(
                    scope, receive, send_wrapper
                )
                return

        received = 0
        max_body = self.max_body

        async def receive_wrapper() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > max_body:
                    raise ProblemError(413, "request.too_large")
            return message

        await self.app(scope, receive_wrapper, send_wrapper)
