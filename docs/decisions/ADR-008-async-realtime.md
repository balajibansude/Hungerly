# ADR-008: Redis for jobs (ARQ), caching, pub/sub and rider geo index; WebSocket realtime

- Status: Proposed
- Date: 2026-09-29

## Context
We need: background jobs and cron (notifications, refunds, timeouts, reconciliation, purges), caching, rate-limit and OTP state, fan-out of realtime events across API replicas, and a fast index of online riders' positions for dispatch.

## Decision
Use **one managed Redis (or Valkey)** instance for:
- **ARQ** job queue and cron (asyncio-native, matches FastAPI stack).
- Cache (cache-aside), rate-limit counters, OTPs, idempotency records, revoked-session deny-list.
- **Pub/sub** to fan out WebSocket events to whichever API replica holds a client's connection.
- **GEO sets** per zone for online riders' latest positions (TTL-refreshed).

Reliability: domain events are persisted first in a PostgreSQL **transactional outbox** and relayed to Redis, so Redis loss never loses business events. Redis is treated as rebuildable.

## Alternatives considered
- **Celery + RabbitMQ:** mature, but heavier (extra broker, sync-first workers) for our needs.
- **Cloud queues (SQS/Cloud Tasks):** managed and durable, but vendor-specific and still require Redis for caching/rate limits/pub-sub.
- **Kafka:** event streaming at large scale; unnecessary cost and complexity for the pilot.
- **PostgreSQL-only (SKIP LOCKED queues, LISTEN/NOTIFY):** fewer components, but adds load to the primary DB and lacks GEO and efficient rate-limit primitives.

## Consequences
- ➕ One inexpensive component covers five needs; simple local development.
- ➖ Redis becomes important for realtime and rate limits — mitigated by outbox, polling fallbacks, and auth endpoints failing closed only where security requires.
- Cost: one small managed instance (≈ USD 15–30/month). Scalability: split cache and queue into separate instances when load requires; move high-volume location ingestion to a dedicated service later.
