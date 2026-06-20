create table public.intervals_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  api_key text not null,
  athlete_id text not null,
  updated_at timestamptz not null default now()
);

alter table public.intervals_credentials enable row level security;
-- No policies: only the service role (Edge Functions) may read/write.
-- This keeps the api_key unreadable by the browser; connection status is
-- returned by an Edge Function, not by a client SELECT.
