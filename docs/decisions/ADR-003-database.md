# ADR-003: PostgreSQL with PostGIS

- Status: Proposed
- Date: 2026-09-29

## Context
Orders, payments, refunds and assignments require strong consistency and constraints. Discovery requires geospatial queries (serviceability polygons, nearby restaurants). MVP search should not need a separate engine.

## Decision
Use **PostgreSQL 16+** as the single system of record with extensions **PostGIS**, **citext**, **pg_trgm**. UUIDv7 keys, integer minor-unit money, `timestamptz`, DB-enforced constraints. Managed service in production. Schema: [DATABASE_SCHEMA.md](../DATABASE_SCHEMA.md).

## Alternatives considered
- **MySQL:** capable, but weaker geospatial and partial-index/constraint features for our rules (e.g. partial unique "one captured payment per order").
- **MongoDB:** flexible documents, but multi-document transactions and relational integrity are central here; would push integrity into application code.
- **Firebase Firestore:** realtime and serverless, but costly at scale per read/write, weak for relational queries and reporting, vendor lock-in.
- **DynamoDB:** scalable, but access-pattern-first modelling and poor ad-hoc querying for admin/analytics.

## Consequences
- ➕ ACID transactions, rich constraints, PostGIS geo, full-text + trigram search, JSONB where needed; ubiquitous managed offerings; portable.
- ➖ Single primary is the write bottleneck at very large scale — mitigated with vertical scaling, PgBouncer, read replicas, partitioning of high-volume tables, and extraction of the location write path to Redis.
- Cost: managed small instance ≈ USD 15–60/month at pilot. Scalability: comfortably multi-city; city-based partitioning possible later.
