# ADR-010: Managed containers + managed PostgreSQL/Redis in an India region

- Status: Proposed (provider choice pending — OD-01)
- Date: 2026-09-29

## Context
A two-person team without dedicated DevOps must run a production system with WebSockets, background workers, a PostGIS database, Redis and object storage — reliably and cheaply — close to Indian users.

## Decision
- Package the backend as **one Docker image** (API and worker commands).
- Run it on a **managed container platform** (rolling deploys, health checks, autoscaling, WebSocket support).
- Use **managed PostgreSQL (with PostGIS)** with automated backups + PITR, and **managed Redis/Valkey**, both on private networking.
- **S3-compatible object storage + CDN**; admin SPA as static files on the CDN.
- **India region** for all production data.
- Infrastructure described with **Terraform** from Phase 11 (staging may start with console setup documented in the repo).

**Provider recommendation:** **DigitalOcean (Bangalore)** for MVP — App Platform (containers, WebSockets), Managed PostgreSQL (PostGIS supported), Managed Caching (Valkey), Spaces (S3 + CDN) — for low cost and operational simplicity. **Choose AWS (Mumbai: ECS Fargate + RDS + ElastiCache + S3/CloudFront) instead if startup credits are available** or if compliance/scale needs require broader services. The architecture uses only portable interfaces (containers, PostgreSQL, Redis protocol, S3 API), so either choice is reversible.

## Alternatives considered
- **Kubernetes (EKS/GKE/DOKS):** flexible, but cluster operations are too heavy for the team at this stage.
- **Serverless functions:** cheap at idle, but awkward for WebSockets, long-running workers and connection pooling to PostgreSQL.
- **Single self-managed VM with Docker Compose:** cheapest, acceptable for local/demo, but no managed backups/failover — too risky for production data.
- **PaaS like Render/Railway/Fly.io:** simple, but India-region availability and managed PostGIS/Redis options are limited or costlier for our needs.

## Consequences
- ➕ Minimal operations; backups and patching handled by the provider; horizontal scaling of stateless containers.
- ➖ Some platform-specific configuration (deploy specs, networking) — contained in `infra/`.
- Cost: ≈ USD 60–185/month production at pilot scale (BLUEPRINT §55); staging smaller.
- Scalability: scale containers horizontally, database vertically + replicas; migrate to Kubernetes only if the number of services grows significantly.
