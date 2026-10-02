"""Production-safe launcher. Always start the API with:  python -m app.serve [--host H] [--port P] [--workers N]

Why not plain `uvicorn app.main:app`: uvicorn trusts X-Forwarded-For from 127.0.0.1 by default and rewrites
the client address before the app sees it. Anything forwarding from the same machine (the admin panel's
proxy, the Expo dev proxy, a local reverse proxy) then lets callers pick their own IP and walk around every
per-IP rate limit (OTP, login, MFA). Here uvicorn trusts no proxy headers; the app's SecurityMiddleware
resolves the client IP itself, honouring X-Forwarded-For only from addresses listed in TRUSTED_PROXIES.
"""

from __future__ import annotations

import argparse
import sys

import uvicorn


def main() -> None:
    p = argparse.ArgumentParser(description="Run the Hungerly API")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--workers", type=int, default=1)
    p.add_argument("--log-level", default="info")
    a = p.parse_args()
    if sys.platform == "win32" and a.workers > 1:
        # uvicorn's multi-process mode on Windows: workers intermittently fail listen() (WinError 10022) and get
        # respawned under load, resetting in-flight connections. Run several single-worker instances behind a
        # proxy instead, or deploy on Linux.
        print("warning: --workers > 1 is unreliable on Windows; using 1 worker", file=sys.stderr)
        a.workers = 1
    uvicorn.run(
        "app.main:app",
        host=a.host,
        port=a.port,
        workers=a.workers,
        log_level=a.log_level,
        proxy_headers=False,  # the app decides which proxies to trust (TRUSTED_PROXIES)
        forwarded_allow_ips="",
        server_header=False,  # don't advertise the server software
        date_header=True,
        # Longer than common load-balancer idle timeouts (60 s), so the LB never reuses a connection uvicorn has
        # just closed (that race shows up as sporadic 502s / connection resets).
        timeout_keep_alive=75,
    )


if __name__ == "__main__":
    main()
