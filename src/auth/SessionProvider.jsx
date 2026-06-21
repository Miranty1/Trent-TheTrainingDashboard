import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const SessionContext = createContext({ session: null, loading: true })
export const useSession = () => useContext(SessionContext)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function init() {
      let { data: { session } } = await supabase.auth.getSession()
      // Dev-only convenience: auto sign-in with local creds so you don't wait
      // for a magic link on every `npm run dev`. Gated to DEV — never runs in
      // a production build, and the creds live only in git-ignored .env.local.
      if (!session && import.meta.env.DEV && import.meta.env.VITE_DEV_EMAIL) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: import.meta.env.VITE_DEV_EMAIL,
          password: import.meta.env.VITE_DEV_PASSWORD,
        })
        if (error) console.warn('[dev auto sign-in] failed:', error.message)
        session = data?.session ?? null
      }
      if (active) {
        setSession(session)
        setLoading(false)
      }
    }
    init()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  return (
    <SessionContext.Provider value={{ session, loading }}>
      {children}
    </SessionContext.Provider>
  )
}
