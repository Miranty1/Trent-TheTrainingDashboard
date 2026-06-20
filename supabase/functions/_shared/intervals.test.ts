import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { basicAuthHeader } from './intervals.ts'

Deno.test('basicAuthHeader uses API_KEY username and base64-encodes the key', () => {
  // base64("API_KEY:secret") === "QVBJX0tFWTpzZWNyZXQ="
  assertEquals(basicAuthHeader('secret'), 'Basic QVBJX0tFWTpzZWNyZXQ=')
})
