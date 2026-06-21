import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// Dev-only: expose the client for one-off console use (e.g. setting a password
// via `await window.__supabase.auth.updateUser({ password })`). Never in prod.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__supabase = supabase
}

export default supabase
