import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

export async function GET() {
  const cookieStore = await cookies()
  const did = cookieStore.get('user_did')?.value

  if (!did) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const walletUrl = process.env.WALLET_SERVICE_URL
  const apiKey = process.env.WALLET_API_KEY

  if (!walletUrl || !apiKey) {
    return NextResponse.json({ error: 'Wallet service not configured' }, { status: 503 })
  }

  const res = await fetch(`${walletUrl}/wallet/${encodeURIComponent(did)}`, {
    headers: { 'X-API-Key': apiKey },
    cache: 'no-store',
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Wallet service error' }, { status: 502 })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
