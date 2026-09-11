# Supabase backend

The commercial Moverse backend (design.md D1/D3): Postgres schema, RLS, and
per-job code minting. Replaces the Airtable base.

Photos do **not** live here — they go to Cloudflare R2 (S3-compatible, zero
egress); this Postgres only stores the R2 object key in `photos.storage_path`.
Supabase covers Postgres + Auth; R2 covers photo storage/serving.

## Layout

- `migrations/0001_schema.sql` — tables (org → job → boxes/items), enums,
  per-job code sequences (`next_box_code`, `next_item_code`, `reserve_item_codes`).
- `migrations/0002_rls.sql` — row-level security enforcing org isolation.
- `tests/rls_cross_tenant.test.sql` — pgTAP proof that org A cannot read org B.

## First-time setup

```sh
# once, from repo root — generates config.toml and the local stack definition
supabase init
# start the local Postgres + Auth + Storage stack
supabase start
# apply migrations to the local DB
supabase db reset
# run the cross-tenant isolation test
supabase test db
```

Link and push to the hosted project when ready:

```sh
supabase link --project-ref <your-project-ref>
supabase db push
```

## Notes

- The API layer (`api/` + `lib/`) connects with the **service role** and derives
  org/job scope from the verified user JWT. RLS is defense-in-depth, not the
  primary gate (see `0002_rls.sql` header).
- R2 photo upload/presigning and the personal-org signup trigger are added in
  later tasks (2.3, 2.6).
- The old Airtable-backed `worker/` stays deployable until data-migration parity
  is confirmed (task 2.11), then is retired (task 8.3).
