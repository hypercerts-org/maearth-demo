import * as crypto from 'crypto'

export function getBaseUrl(): string {
  return (process.env.PUBLIC_URL || 'http://localhost:3000').trim()
}

// PKCE helpers
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export function generateState(): string {
  return crypto.randomBytes(16).toString('base64url')
}



// Generate a fresh DPoP key pair (call per OAuth flow, not cached)
export function generateDpopKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  })

  const publicJwk = publicKey.export({ format: 'jwk' })
  const privateJwk = privateKey.export({ format: 'jwk' })

  return { publicKey, privateKey, publicJwk, privateJwk }
}

// Restore a DPoP key pair from a serialized private JWK
export function restoreDpopKeyPair(privateJwk: crypto.JsonWebKey) {
  const privateKey = crypto.createPrivateKey({ key: privateJwk, format: 'jwk' })
  const publicKey = crypto.createPublicKey(privateKey)
  const publicJwk = publicKey.export({ format: 'jwk' })

  return { publicKey, privateKey, publicJwk, privateJwk }
}

export function createDpopProof(opts: {
  privateKey: crypto.KeyObject
  jwk: object
  method: string
  url: string
  nonce?: string
  accessToken?: string
}): string {
  const header = {
    alg: 'ES256',
    typ: 'dpop+jwt',
    jwk: opts.jwk,
  }

  const payload: Record<string, unknown> = {
    jti: crypto.randomUUID(),
    htm: opts.method,
    htu: opts.url,
    iat: Math.floor(Date.now() / 1000),
  }

  if (opts.nonce) {
    payload.nonce = opts.nonce
  }

  if (opts.accessToken) {
    payload.ath = crypto.createHash('sha256').update(opts.accessToken).digest('base64url')
  }

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signingInput = `${headerB64}.${payloadB64}`

  const signature = crypto.sign('sha256', Buffer.from(signingInput), opts.privateKey)
  // Convert DER signature to raw r||s format for ES256
  const sigB64 = derToRaw(signature).toString('base64url')

  return `${signingInput}.${sigB64}`
}

// Convert DER-encoded ECDSA signature to raw r||s format
function derToRaw(der: Buffer): Buffer {
  // DER: 0x30 [total-len] 0x02 [r-len] [r] 0x02 [s-len] [s]
  let offset = 2 // skip 0x30 and total length
  if (der[1]! > 0x80) offset += der[1]! - 0x80 // long form length

  // Read r
  offset++ // skip 0x02
  const rLen = der[offset]!
  offset++
  let r = der.subarray(offset, offset + rLen)
  offset += rLen

  // Read s
  offset++ // skip 0x02
  const sLen = der[offset]!
  offset++
  let s = der.subarray(offset, offset + sLen)

  // Trim leading zeros and pad to 32 bytes
  if (r.length > 32) r = r.subarray(r.length - 32)
  if (s.length > 32) s = s.subarray(s.length - 32)

  const raw = Buffer.alloc(64)
  r.copy(raw, 32 - r.length)
  s.copy(raw, 64 - s.length)
  return raw
}

// PDS endpoints
export const PDS_URL = 'https://pds.certs.network'
export const PAR_ENDPOINT = `${PDS_URL}/oauth/par`
export const AUTH_ENDPOINT = 'https://auth.pds.certs.network/oauth/authorize'
export const TOKEN_ENDPOINT = `${PDS_URL}/oauth/token`
