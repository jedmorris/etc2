# Database Migrations

Sequential SQL migration files for the etC2 schema.

## Naming Convention

`NNNNN_description.sql` — zero-padded number + snake_case description.

## Applying Migrations

Migrations are applied in order. The initial schema (`00000_initial_schema.sql`) represents the full baseline.

For new changes:
1. Create a new file: `00001_add_column_name.sql`
2. Write idempotent SQL (use `IF NOT EXISTS`, `CREATE OR REPLACE`, etc.)
3. Test locally, then apply to production via Supabase dashboard or CLI

## Current State

- `00000_initial_schema.sql` — Full baseline schema (copied from `supabase_schema.sql`)
