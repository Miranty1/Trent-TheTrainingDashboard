import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function sendLink(e) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main>
      <h1>Trent</h1>
      {sent ? (
        <p>Check your email for a magic link.</p>
      ) : (
        <form onSubmit={sendLink}>
          <input type="email" value={email} required placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)} />
          <button type="submit">Send magic link</button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </main>
  )
}
