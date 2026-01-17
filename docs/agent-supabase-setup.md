# Supabase setup for Lumen Agent

## Environment variables
Set these in Vercel (Production + Preview + Development):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional (recommended for extra security):

- `AGENT_TOKEN`

## Database schema (SQL)
Run in Supabase SQL editor:

```sql
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid,
  user_email text,
  categories text[],
  max_results int,
  include_audio boolean,
  include_images boolean,
  dry_run boolean,
  note_file text,
  warnings jsonb,
  papers jsonb,
  status text
);

alter table public.agent_runs enable row level security;

create policy "agent_runs_insert" on public.agent_runs
for insert with check (auth.uid() = user_id);

create policy "agent_runs_read" on public.agent_runs
for select using (auth.uid() = user_id);
```

## Usage
- Visit `/agent/`, sign in with email, then run the agent.
- The API uses the Supabase access token to authorize and logs runs.
