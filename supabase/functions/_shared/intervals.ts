import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BASE_URL = 'https://intervals.icu/api/v1'

// CORS: the browser calls these functions cross-origin (Vercel -> Supabase),
// which triggers a preflight. Single-user app, bearer-token auth (no cookies),
// so a wildcard origin is acceptable.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function basicAuthHeader(apiKey: string): string {
  // Intervals.icu uses HTTP Basic auth: username is the literal "API_KEY",
  // password is the user's key.
  return `Basic ${btoa(`API_KEY:${apiKey}`)}`
}

export function intervalsFetch(apiKey: string, path: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: basicAuthHeader(apiKey) },
  })
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

export async function getCredentials(
  admin: SupabaseClient,
  userId: string,
): Promise<{ api_key: string; athlete_id: string }> {
  const { data, error } = await admin
    .from('intervals_credentials')
    .select('api_key, athlete_id')
    .eq('user_id', userId)
    .single()
  if (error || !data) throw new Error('No Intervals.icu credentials for user')
  return data
}
