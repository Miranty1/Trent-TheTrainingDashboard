import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, corsHeaders, getCredentials, intervalsFetch, jsonResponse } from '../_shared/intervals.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return jsonResponse({ connected: false, error: 'Unauthorized' }, 401)

  const admin = adminClient()
  let creds: { api_key: string; athlete_id: string }
  try {
    creds = await getCredentials(admin, user.id)
  } catch {
    return jsonResponse({ connected: false })
  }

  const res = await intervalsFetch(creds.api_key, `/athlete/${creds.athlete_id}`)
  if (!res.ok) return jsonResponse({ connected: false, error: 'Upstream error' }, 502)
  const athlete = await res.json()
  return jsonResponse({ connected: true, athlete })
})
