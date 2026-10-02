"""Black-box API probe. Knows nothing about the code: it reads the published OpenAPI route list and attacks
every endpoint over HTTP.

Checks, for every route:
  * authentication: no token / wrong app's token must be rejected (401/403), never served
  * path-parameter fuzzing: invalid ids, traversal, SQL, huge values  -> 4xx, never 5xx
  * body fuzzing per field: wrong types, nulls, huge strings, negative / overflow numbers, unicode,
    SQL / script / template payloads, unknown fields, wrong top-level shapes -> 4xx, never 5xx
  * every response: security headers present, errors are application/problem+json, no stack traces
    or database internals, rejected input never echoed back
Plus targeted checks: per-route rate limits, X-Forwarded-For spoofing, method confusion, oversize bodies.

Usage: python tests/blackbox/probe.py http://127.0.0.1:8001 <qa-admin.json>
"""

from __future__ import annotations

import asyncio
import json
import random
import re
import sys
import uuid
from collections import Counter, defaultdict
from pathlib import Path

import httpx
import pyotp

BASE = sys.argv[1].rstrip("/")
QA = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
API = BASE + "/api/v1"
LEAK = re.compile(r"Traceback|sqlalchemy|asyncpg|psycopg|File \"|line \d+, in|postgres|SELECT .* FROM", re.IGNORECASE)
PAYLOADS = [
    "' OR '1'='1", "1; DROP TABLE users;--", "<script>alert(1)</script>", "{{7*7}}", "${7*7}", "../../../../etc/passwd",
    "\u0000", "𝕳𝖚𝖓𝖌𝖊𝖗𝖑𝖞 🍔", "A" * 5000, "-1", "1e309", "NaN", " ", "",
]
WRONG_VALUES = [None, True, -1, 0, 2**63, -(2**63) - 1, 1.5, "x" * 20000, [], {}, ["a"], {"$gt": ""}, *PAYLOADS]

findings: list[str] = []
stats = Counter()
seen: set[str] = set()


def finding(msg: str) -> None:
    if msg not in seen:
        seen.add(msg)
        findings.append(msg)


def check_response(label: str, r: httpx.Response, sent: str | None = None) -> None:
    stats[r.status_code // 100] += 1
    if r.status_code >= 500:
        finding(f"[5xx] {label} -> {r.status_code} {r.text[:200]}")
    for h in ("x-content-type-options", "x-frame-options", "referrer-policy", "x-request-id"):
        if h not in r.headers:
            finding(f"[headers] {label} missing {h}")
    body = r.text[:20000]
    if LEAK.search(body):
        finding(f"[leak] {label} response contains internals: {LEAK.search(body).group(0)!r}")
    if r.status_code >= 400 and r.status_code != 404 and "problem+json" not in r.headers.get("content-type", "") and r.status_code != 405:
        finding(f"[format] {label} error is not problem+json ({r.headers.get('content-type')})")
    if sent and len(sent) >= 8 and r.status_code >= 400 and sent in body and sent not in ("A" * 5000)[:0]:
        finding(f"[echo] {label} echoes rejected input back: {sent[:40]!r}")


async def tokens(c: httpx.AsyncClient) -> dict:
    out = {}

    async def otp(phone: str, app: str) -> str:
        dev = "bb-" + uuid.uuid4().hex[:16]
        r = await c.post(f"{API}/auth/otp/request", json={"phone_e164": phone, "client_app": app, "device_id": dev})
        rid = r.json()["otp_request_id"]
        r = await c.post(f"{API}/auth/otp/verify", json={"otp_request_id": rid, "phone_e164": phone, "otp": "123456", "client_app": app, "device_id": dev})
        return r.json()["access_token"]

    out["customer"] = await otp(f"+9198{random.randint(10_000_000, 99_999_999)}", "customer")
    out["rider"] = await otp(f"+9196{random.randint(10_000_000, 99_999_999)}", "delivery")  # fresh number: OTP limits are per phone
    r = await c.post(f"{API}/auth/login", json={"email": QA["email"], "password": QA["password"]})
    r = await c.post(f"{API}/auth/mfa/verify", json={"mfa_token": r.json()["mfa_token"], "code": pyotp.TOTP(QA["totp_secret"]).now()})
    out["admin"] = r.json()["access_token"]
    return out


def is_public(op: dict) -> bool:
    return bool(op.get("public"))


def fill_path(path: str, value: str) -> str:
    return re.sub(r"\{[^}]+\}", value, path)


def body_schema(spec: dict, op: dict) -> dict | None:
    content = (op.get("requestBody") or {}).get("content", {}).get("application/json")
    if not content:
        return None
    s = content["schema"]
    if "$ref" in s:
        s = spec["components"]["schemas"][s["$ref"].split("/")[-1]]
    return s


async def main() -> None:
    limits = httpx.Limits(max_connections=20)
    async with httpx.AsyncClient(timeout=20, limits=limits) as c:
        spec = (await c.get(f"{BASE}/api/openapi.json")).json()
        tok = await tokens(c)
        sem = asyncio.Semaphore(16)
        routes = [(p, m, op) for p, item in spec["paths"].items() for m, op in item.items() if m in ("get", "post", "put", "patch", "delete")]
        print(f"routes: {len(routes)}")

        async def req(label, method, url, headers=None, sent=None, **kw):
            async with sem:
                try:
                    r = await c.request(method, url, headers=headers, **kw)
                except httpx.HTTPError as e:
                    finding(f"[transport] {label} {type(e).__name__}")
                    return None
            check_response(label, r, sent)
            return r

        jobs = []
        for path, method, op in routes:
            url_path = BASE + fill_path(path, str(uuid.uuid4()))
            prefix = path.split("/")[3] if path.startswith("/api/v1/") else path
            public = is_public(op)
            label = f"{method.upper()} {path}"

            # 1. authentication
            async def auth_checks(path=path, method=method, url_path=url_path, prefix=prefix, public=public, label=label):
                r = await req(label + " [no token]", method, url_path, json={} if method != "get" else None)
                if r is not None and not public and r.status_code < 400:
                    finding(f"[auth] {label} served WITHOUT a token ({r.status_code})")
                wrong = {"admin": ["customer", "rider"], "delivery": ["customer", "admin"], "customer": ["rider", "admin"]}.get(prefix, [])
                for who in wrong:
                    r = await req(f"{label} [{who} token]", method, url_path, headers={"Authorization": f"Bearer {tok[who]}"}, json={} if method != "get" else None)
                    if r is not None and r.status_code < 400:
                        finding(f"[authz] {label} served to a {who} token ({r.status_code})")
                forged = tok["customer"][:-4] + "abcd"
                r = await req(f"{label} [forged]", method, url_path, headers={"Authorization": f"Bearer {forged}"}, json={} if method != "get" else None)
                if r is not None and not public and r.status_code < 400:
                    finding(f"[auth] {label} accepted a forged token")

            jobs.append(auth_checks())

            owner = "admin" if prefix == "admin" else "rider" if prefix == "delivery" else "customer"
            auth = {"Authorization": f"Bearer {tok[owner]}"}

            # 2. path-parameter fuzzing
            if "{" in path:
                for bad in ["abc", "1", "../../etc/passwd", "1%20OR%201=1", "%00", "9" * 400, str(uuid.uuid4()).upper()]:
                    jobs.append(req(f"{label} [path={bad[:20]}]", method, BASE + fill_path(path, bad), headers=auth, json={} if method != "get" else None))

            # 3. body fuzzing
            schema = body_schema(spec, op)
            if schema and method in ("post", "put", "patch"):
                url = url_path
                props = schema.get("properties", {})
                for shape in ([], "text", 12, None, {"__proto__": {"admin": True}}, {"unknown_field": 1}):
                    jobs.append(req(f"{label} [body={type(shape).__name__}]", method, url, headers=auth, json=shape))
                jobs.append(req(f"{label} [deep]", method, url, headers=auth, content=("[" * 5000 + "]" * 5000).encode(), sent=None))
                jobs.append(req(f"{label} [not-json]", method, url, headers={**auth, "content-type": "application/json"}, content=b"{not json", sent=None))
                for field in props:
                    for v in random.sample(WRONG_VALUES, 10):
                        body = {k: (v if k == field else None) for k in props}
                        sent = v if isinstance(v, str) else None
                        jobs.append(req(f"{label} [{field}={str(v)[:15]!r}]", method, url, headers=auth, json=body, sent=sent))

            # 4. query-param fuzzing on GETs
            if method == "get":
                for p in op.get("parameters", []):
                    if p.get("in") == "query":
                        for v in ["-1", "99999999999999999999", "' OR 1=1--", "<x>", "NaN", "", "x" * 3000]:
                            jobs.append(req(f"{label} [?{p['name']}={v[:12]}]", "get", url_path, headers=auth, params={p["name"]: v}, sent=v if len(v) >= 8 else None))
        print(f"requests: ~{len(jobs) + sum(1 for _ in routes) * 3}")
        await asyncio.gather(*jobs)

        # 5. targeted checks
        r = await c.request("TRACE", f"{API}/catalog/cuisines")
        if r.status_code < 400:
            finding("[method] TRACE accepted")
        r = await c.post(f"{API}/catalog/cuisines")
        check_response("POST on GET-only route", r)
        r = await c.post(f"{API}/auth/otp/request", content=b"x" * 2_000_000, headers={"content-type": "application/json"})
        if r.status_code != 413:
            finding(f"[size] 2 MB body not rejected with 413 ({r.status_code})")
        # per-route limit on catalog (120/min) must hold even with spoofed X-Forwarded-For
        codes = Counter()
        for i in range(140):
            rr = await c.get(f"{API}/catalog/cuisines", headers={"X-Forwarded-For": f"10.0.{i // 250}.{i % 250}"})
            codes[rr.status_code] += 1
        if codes.get(429, 0) == 0:
            finding(f"[ratelimit] catalog limit bypassed with spoofed X-Forwarded-For: {dict(codes)}")
        else:
            limited = next(x for x in [rr] if x.status_code == 429)
            if "retry-after" not in limited.headers:
                finding("[ratelimit] 429 without Retry-After")
        # OTP brute force: verify attempts are capped
        dev = "bb-" + uuid.uuid4().hex[:16]
        phone = f"+9197{random.randint(10_000_000, 99_999_999)}"
        rid = (await c.post(f"{API}/auth/otp/request", json={"phone_e164": phone, "client_app": "customer", "device_id": dev})).json()["otp_request_id"]
        statuses = []
        for guess in range(8):
            rr = await c.post(f"{API}/auth/otp/verify", json={"otp_request_id": rid, "phone_e164": phone, "otp": f"{guess:06d}", "client_app": "customer", "device_id": dev})
            statuses.append(rr.status_code)
        if 429 not in statuses:
            finding(f"[bruteforce] OTP guesses not capped: {statuses}")

    print(f"responses by class: { {f'{k}xx': v for k, v in sorted(stats.items())} }")
    print(f"FINDINGS ({len(findings)})")
    by_kind = defaultdict(list)
    for f in findings:
        by_kind[f.split("]")[0] + "]"].append(f)
    for kind, items in by_kind.items():
        print(f"  {kind} x{len(items)}")
        for f in items[:12]:
            print("    ", f)


asyncio.run(main())
