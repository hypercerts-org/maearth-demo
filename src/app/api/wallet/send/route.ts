import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
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

  let body: { to?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const to = (body.to || '').trim()
  if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
    return NextResponse.json({ error: 'Invalid Ethereum address' }, { status: 400 })
  }

  const res = await fetch(`${walletUrl}/wallet/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ did, to }),
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status })
  }

  return NextResponse.json(data)
}
