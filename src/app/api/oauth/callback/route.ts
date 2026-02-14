import { NextRequest, NextResponse } from 'next/server'
import * as crypto from 'crypto'
import {
  getBaseUrl, restoreDpopKeyPair, createDpopProof,
  TOKEN_ENDPOINT, PDS_URL,
} from '@/lib/auth'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl()

  try {
    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    const error = request.nextUrl.searchParams.get('error')

    if (error) {
      console.error('[oauth/callback] Auth error:', error)
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, baseUrl))
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/?error=missing_code_or_state', baseUrl))
    }

    // Retrieve PKCE verifier from cookie
    const cookieStore = await cookies()
    const stateCookie = cookieStore.get('oauth_state')
    if (!stateCookie) {
      return NextResponse.redirect(new URL('/?error=invalid_state_no_cookie', baseUrl))
    }
    let stateData: { state: string; codeVerifier: string; dpopPrivateJwk: Record<string, unknown> }
    try {
      stateData = JSON.parse(stateCookie.value)
    } catch {
      return NextResponse.redirect(new URL('/?error=invalid_state_parse', baseUrl))
    }
    if (stateData.state !== state) {
      return NextResponse.redirect(new URL('/?error=invalid_state_mismatch', baseUrl))
    }
    const codeVerifier = stateData.codeVerifier

    const clientId = `${baseUrl}/client-metadata.json`
    const redirectUri = `${baseUrl}/api/oauth/callback`

    // Exchange code for tokens with DPoP
    if (!stateData.dpopPrivateJwk) {
      return NextResponse.redirect(new URL('/?error=missing_dpop_key', baseUrl))
    }
    const { privateKey, publicJwk } = restoreDpopKeyPair(stateData.dpopPrivateJwk as crypto.JsonWebKey)

    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    })

    // First attempt
    let dpopProof = createDpopProof({
      privateKey, jwk: publicJwk,
      method: 'POST',
      url: TOKEN_ENDPOINT,
    })

    let tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'DPoP': dpopProof,
      },
      body: tokenBody.toString(),
    })

    // Handle DPoP nonce requirement
    if (!tokenRes.ok) {
      const dpopNonce = tokenRes.headers.get('dpop-nonce')
      if (dpopNonce) {
        console.log('[oauth/callback] Retrying token exchange with DPoP nonce...')
        dpopProof = createDpopProof({
          privateKey, jwk: publicJwk,
          method: 'POST',
          url: TOKEN_ENDPOINT,
          nonce: dpopNonce,
        })

        tokenRes = await fetch(TOKEN_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'DPoP': dpopProof,
          },
          body: tokenBody.toString(),
        })
      }
    }

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('[oauth/callback] Token exchange failed:', tokenRes.status, errText)
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent('Token exchange failed')}`, baseUrl))
    }

    const tokenData = await tokenRes.json() as {
      access_token: string
      token_type: string
      sub: string
      scope?: string
    }

    console.log('[oauth/callback] Got tokens, sub:', tokenData.sub)

    // Resolve handle from DID via PLC directory (no auth needed)
    let handle = tokenData.sub
    try {
      const plcRes = await fetch(`https://plc.directory/${tokenData.sub}`)
      if (plcRes.ok) {
        const plcData = await plcRes.json() as { alsoKnownAs?: string[] }
        const atUri = plcData.alsoKnownAs?.find((u: string) => u.startsWith('at://'))
        if (atUri) {
          handle = atUri.replace('at://', '')
        }
      }
    } catch (err) {
      console.warn('[oauth/callback] Could not resolve handle from PLC:', err)
    }

    // Set cookies (reuse cookieStore from above)

    cookieStore.set('user_did', tokenData.sub, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    })
    cookieStore.set('user_handle', handle, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    })

    return NextResponse.redirect(new URL('/welcome', baseUrl))
  } catch (err) {
    console.error('[oauth/callback] Error:', err)
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(errorMsg)}`, baseUrl))
  }
}
