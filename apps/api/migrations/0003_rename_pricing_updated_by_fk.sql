-- 0002 declared this foreign key inline, so PostgreSQL auto-named it `..._fkey`.
-- Rename it to Drizzle's `<table>_<column>_<ref table>_<ref column>_fk` convention so the
-- live database matches the schema snapshot and future generated migrations.
ALTER TABLE "platform_pricing_configs"
  RENAME CONSTRAINT "platform_pricing_configs_updated_by_fkey"
  TO "platform_pricing_configs_updated_by_users_id_fk";
