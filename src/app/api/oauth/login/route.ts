import { NextResponse } from 'next/server'
import { getOAuthClient, getBaseUrl } from '@/lib/auth'

export async function GET() {
  try {
    const client = await getOAuthClient()
    const handle = 'pds.certs.network'

    const url = await client.authorize(handle, {
      scope: 'atproto transition:generic',
    })

    return NextResponse.redirect(url.toString())
  } catch (err) {
    console.error('OAuth login error:', err)
    return NextResponse.redirect(new URL('/?error=login_failed', getBaseUrl()))
  }
}
