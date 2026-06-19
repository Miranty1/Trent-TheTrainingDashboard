# Trent — The Training Dashboard

A free, single-user fitness dashboard that pulls Strava data (synced from a COROS Pace 4) into Premium-style trends, personal bests, and training-load analytics.

## Setup
Copy `.env.example` to `.env` and fill in your Supabase project values, then `npm install` and `npm run dev`.

## Supabase setup (manual, later)
The following steps must be completed in the Supabase dashboard after a project is linked:
- Link the local Supabase project: `supabase link --project-ref <project-ref>`
- Apply database migrations: `supabase db push`
- Disable public signups: Authentication → Providers/Settings → disable "Enable signup"
- Provision the single allowed user: Authentication → Users → "Add user" with your email (send magic link or mark as confirmed)
