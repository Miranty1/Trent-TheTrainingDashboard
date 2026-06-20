-- activities: one row per activity, all types
create table public.activities (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text,
  sub_type text,
  name text,
  start_date timestamptz,
  start_date_local text,
  distance real,
  moving_time int,
  elapsed_time int,
  total_elevation_gain real,
  training_load int,
  intensity real,
  average_heartrate int,
  max_heartrate int,
  average_cadence real,
  average_speed real,
  max_speed real,
  calories int,
  gear text,
  feel int,
  trainer boolean,
  source text,
  raw jsonb,
  synced_at timestamptz not null default now()
);
create index activities_user_start on public.activities (user_id, start_date desc);
create index activities_user_type on public.activities (user_id, type);

-- streams: Run/Ride only, lazy-loaded full-resolution blob
create table public.streams (
  activity_id text primary key references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  synced_at timestamptz not null default now()
);

-- wellness: one row per day
create table public.wellness (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  ctl real,
  atl real,
  ramp_rate real,
  resting_hr int,
  hrv real,
  sleep_secs int,
  weight real,
  readiness int,
  raw jsonb,
  synced_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- sync_state: resume/progress, one row per user
create table public.sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_activity_date timestamptz,
  backfill_oldest_date date,
  status text,
  message text,
  updated_at timestamptz not null default now()
);

alter table public.activities enable row level security;
alter table public.streams enable row level security;
alter table public.wellness enable row level security;
alter table public.sync_state enable row level security;

create policy "owner reads activities" on public.activities for select using (auth.uid() = user_id);
create policy "owner reads streams"    on public.streams    for select using (auth.uid() = user_id);
create policy "owner reads wellness"   on public.wellness   for select using (auth.uid() = user_id);
create policy "owner reads sync_state" on public.sync_state for select using (auth.uid() = user_id);
-- No insert/update/delete policies: the service-role sync function bypasses RLS for writes.
