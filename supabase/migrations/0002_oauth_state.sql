create table public.oauth_state (
  nonce text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  frontend_origin text not null,
  expires_at timestamptz not null
);

alter table public.oauth_state enable row level security;
-- no policies: only the service role (Edge Functions) may read/write.
