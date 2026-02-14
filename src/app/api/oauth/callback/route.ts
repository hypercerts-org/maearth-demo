import { NextRequest, NextResponse } from 'next/server'
import { getOAuthClient, getBaseUrl } from '@/lib/auth'
import { Agent } from '@atproto/api'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const client = await getOAuthClient()
    const params = new URLSearchParams(request.nextUrl.search)

    const { session } = await client.callback(params)

    const did = session.did
    let handle: string = did

    // Create an Agent using the session to get the user's handle
    try {
      const agent = new Agent(session)
      const res = await agent.com.atproto.server.getSession()
      handle = res.data.handle || did
    } catch {
      // If we can't fetch profile, just use DID
    }

    // Set cookies and redirect to welcome page
    const cookieStore = await cookies()
    cookieStore.set('user_did', did, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    })
    cookieStore.set('user_handle', handle, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    })

    return NextResponse.redirect(new URL('/welcome', getBaseUrl()))
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(new URL('/?error=auth_failed', getBaseUrl()))
  }
}
