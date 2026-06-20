import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, intervalsFetch } from '../_shared/intervals.ts'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { apiKey, athleteId } = await req.json()
  if (!apiKey || !athleteId) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing apiKey or athleteId' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate the credentials before persisting.
  const probe = await intervalsFetch(apiKey, `/athlete/${athleteId}`)
  if (!probe.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid API key or athlete ID' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
  const athlete = await probe.json()

  const admin = adminClient()
  const { error } = await admin.from('intervals_credentials').upsert({
    user_id: user.id,
    api_key: apiKey,
    athlete_id: String(athleteId),
    updated_at: new Date().toISOString(),
  })
  if (error) return new Response(`Save failed: ${error.message}`, { status: 500 })

  return new Response(JSON.stringify({ ok: true, athlete }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
