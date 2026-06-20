import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, corsHeaders, intervalsFetch, jsonResponse } from '../_shared/intervals.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)

  let body: { apiKey?: string; athleteId?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400)
  }
  const { apiKey, athleteId } = body
  if (!apiKey || !athleteId) {
    return jsonResponse({ ok: false, error: 'Missing apiKey or athleteId' }, 400)
  }

  // Validate the credentials before persisting.
  const probe = await intervalsFetch(apiKey, `/athlete/${athleteId}`)
  if (!probe.ok) {
    return jsonResponse({ ok: false, error: 'Invalid API key or athlete ID' }, 400)
  }
  const athlete = await probe.json()

  const admin = adminClient()
  const { error } = await admin.from('intervals_credentials').upsert({
    user_id: user.id,
    api_key: apiKey,
    athlete_id: String(athleteId),
    updated_at: new Date().toISOString(),
  })
  if (error) return jsonResponse({ ok: false, error: 'Save failed' }, 500)

  return jsonResponse({ ok: true, athlete })
})
