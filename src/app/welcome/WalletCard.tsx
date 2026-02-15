'use client'

import { useState, useEffect } from 'react'

interface WalletData {
  exists: boolean
  eoaAddress: string | null
  smartAccountAddress: string | null
}

export function WalletCard({ initial }: { initial: WalletData | null }) {
  const [wallet, setWallet] = useState(initial)
  const [polling, setPolling] = useState(
    initial?.exists === true && !initial?.smartAccountAddress
  )

  useEffect(() => {
    if (!polling) return
    let attempts = 0
    const maxAttempts = 5
    const interval = setInterval(async () => {
      attempts++
      try {
        const res = await fetch('/api/wallet')
        if (res.ok) {
          const data = await res.json()
          setWallet(data)
          if (data.smartAccountAddress || attempts >= maxAttempts) {
            setPolling(false)
            clearInterval(interval)
          }
        }
      } catch {
        // ignore, will retry
      }
      if (attempts >= maxAttempts) {
        setPolling(false)
        clearInterval(interval)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [polling])

  if (!wallet?.exists) {
    return null
  }

  const monoStyle: React.CSSProperties = {
    fontSize: '13px',
    color: '#6b6b6b',
    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
    wordBreak: 'break-all',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      padding: '28px 32px',
      textAlign: 'left',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      marginBottom: '32px',
    }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={labelStyle}>EOA Address</div>
        <div style={monoStyle}>{wallet.eoaAddress}</div>
      </div>
      <div>
        <div style={labelStyle}>Smart Account Address</div>
        <div style={monoStyle}>
          {wallet.smartAccountAddress
            ? wallet.smartAccountAddress
            : polling
              ? 'Computing...'
              : 'Not yet available'}
        </div>
      </div>
    </div>
  )
}
