import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, getCredentials, intervalsFetch } from '../_shared/intervals.ts'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = adminClient()
  let creds: { api_key: string; athlete_id: string }
  try {
    creds = await getCredentials(admin, user.id)
  } catch {
    return new Response(JSON.stringify({ connected: false }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await intervalsFetch(creds.api_key, `/athlete/${creds.athlete_id}`)
  if (!res.ok) return new Response(JSON.stringify({ connected: false, error: 'Upstream error' }), {
    status: 502, headers: { 'Content-Type': 'application/json' },
  })
  const athlete = await res.json()
  return new Response(JSON.stringify({ connected: true, athlete }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
