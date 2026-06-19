create table public.strava_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  athlete_id bigint,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.strava_tokens enable row level security;

create policy "owner reads own tokens"
  on public.strava_tokens for select
  using (auth.uid() = user_id);
-- writes happen only via Edge Functions using the service role, which bypasses RLS.
