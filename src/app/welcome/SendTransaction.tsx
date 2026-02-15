'use client'

import { useState } from 'react'

export function SendTransaction({ smartAccountAddress }: { smartAccountAddress: string | null }) {
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<{ txHash: string; userOpHash: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  if (!smartAccountAddress) return null

  const handleSend = async () => {
    const trimmed = to.trim()
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      setErrorMsg('Please enter a valid Ethereum address (0x...)')
      setStatus('error')
      return
    }

    setStatus('sending')
    setErrorMsg('')
    setResult(null)

    try {
      const res = await fetch('/api/wallet/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: trimmed }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Transaction failed')
      }

      setResult(data)
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transaction failed')
      setStatus('error')
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
  }

  const monoStyle: React.CSSProperties = {
    fontSize: '13px',
    color: '#6b6b6b',
    fontFamily: "'SF Mono', Menlo, Consolas, monospace",
    wordBreak: 'break-all',
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
      <div style={labelStyle}>Send Test Transaction (0 ETH)</div>
      <p style={{ fontSize: '13px', color: '#6b6b6b', margin: '4px 0 16px 0' }}>
        Send a gasless 0 ETH transaction from your smart account.
      </p>

      <div style={{ marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="0x... recipient address"
          value={to}
          onChange={(e) => { setTo(e.target.value); if (status === 'error') setStatus('idle') }}
          disabled={status === 'sending'}
          style={{
            width: '100%',
            padding: '12px 14px',
            fontSize: '14px',
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            border: '1px solid #d4d0cb',
            borderRadius: '8px',
            outline: 'none',
            boxSizing: 'border-box',
            background: status === 'sending' ? '#f5f5f5' : '#fff',
            color: '#1A130F',
          }}
        />
      </div>

      <button
        onClick={handleSend}
        disabled={status === 'sending'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 24px',
          fontSize: '14px',
          fontWeight: 500,
          color: '#faf9f6',
          background: status === 'sending' ? '#4a4a4a' : '#1A130F',
          border: 'none',
          borderRadius: '8px',
          cursor: status === 'sending' ? 'default' : 'pointer',
          opacity: status === 'sending' ? 0.7 : 1,
        }}
      >
        {status === 'sending' ? 'Sending...' : 'Send'}
      </button>

      {status === 'error' && (
        <div style={{
          background: '#fdf0f0',
          color: '#dc3545',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          marginTop: '16px',
        }}>
          {errorMsg}
        </div>
      )}

      {status === 'success' && result && (
        <div style={{
          background: '#f0fdf4',
          padding: '16px',
          borderRadius: '8px',
          marginTop: '16px',
        }}>
          <div style={{ fontSize: '13px', color: '#166534', fontWeight: 500, marginBottom: '8px' }}>
            Transaction sent successfully
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ ...labelStyle, color: '#166534' }}>Transaction Hash</div>
            <a
              href={`https://sepolia.etherscan.io/tx/${result.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...monoStyle, color: '#166534', textDecoration: 'underline' }}
            >
              {result.txHash}
            </a>
          </div>
          <div>
            <div style={{ ...labelStyle, color: '#166534' }}>UserOp Hash</div>
            <div style={{ ...monoStyle, color: '#166534' }}>
              {result.userOpHash}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
