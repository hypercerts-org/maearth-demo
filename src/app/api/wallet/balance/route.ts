import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const SEPOLIA_RPC = 'https://rpc.sepolia.org'

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  try {
    const res = await fetch(SEPOLIA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }),
    })

    const data = await res.json() as { result?: string; error?: { message: string } }

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 502 })
    }

    // Convert hex wei to ETH string
    const wei = BigInt(data.result || '0x0')
    const eth = Number(wei) / 1e18

    return NextResponse.json({ balance: eth.toString() })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 502 })
  }
}
