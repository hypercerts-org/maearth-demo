"use client"

import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'

function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<'email' | 'handle'>('email')

  const switchMode = (newMode: 'email' | 'handle') => {
    setMode(newMode)
    setSubmitting(false)
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      padding: '20px',
      overflow: 'hidden',
      background: '#F2EBE4',
    }}>
      <div style={{
        maxWidth: '440px',
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: '24px' }}>
          <img src="/logo.png" alt="Ma Earth" style={{ height: '80px', marginBottom: '16px' }} />
        </div>

        {error && (
          <div style={{
            background: '#fdf0f0',
            color: '#dc3545',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            marginBottom: '16px',
            maxWidth: '290px',
            margin: '0 auto 16px',
          }}>
            {decodeURIComponent(error)}
          </div>
        )}

        <form
          action="/api/oauth/login"
          method="GET"
          style={{ margin: '0 auto', maxWidth: '290px' }}
          onSubmit={() => { setTimeout(() => setSubmitting(true), 0) }}
        >
          <div style={{ marginBottom: '16px', textAlign: 'left' }}>
            <label htmlFor={mode === 'email' ? 'email' : 'handle'} style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: '#1A130F',
              marginBottom: '6px',
            }}>
              {mode === 'email' ? 'Email address' : 'Handle'}
            </label>
            {mode === 'email' ? (
              <input
                type="email"
                id="email"
                name="email"
                required
                autoFocus
                placeholder="you@example.com"
                readOnly={submitting}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '16px',
                  border: '1px solid #d4d0cb',
                  borderRadius: '8px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: submitting ? '#f5f5f5' : '#fff',
                  color: '#1A130F',
                }}
              />
            ) : (
              <input
                type="text"
                id="handle"
                name="handle"
                required
                autoFocus
                placeholder="you.bsky.social"
                readOnly={submitting}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '16px',
                  border: '1px solid #d4d0cb',
                  borderRadius: '8px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  background: submitting ? '#f5f5f5' : '#fff',
                  color: '#1A130F',
                }}
              />
            )}
          </div>
          <button
            type="submit"
            disabled={submitting}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: '14px 28px',
              fontSize: '16px',
              fontWeight: 500,
              color: '#faf9f6',
              background: submitting ? '#4a4a4a' : '#1A130F',
              border: 'none',
              borderRadius: '8px',
              cursor: submitting ? 'default' : 'pointer',
              letterSpacing: '0.3px',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {mode === 'email' ? (
              submitting ? 'Sending verification code...' : (
                <>
                  <img src="/certified-logo.png" alt="" style={{ height: '20px' }} />
                  <span style={{ width: '12px' }}></span>
                  Sign in with Certified
                </>
              )
            ) : (
              submitting ? 'Redirecting...' : 'Sign in'
            )}
          </button>
        </form>

        <p
          onClick={() => switchMode(mode === 'email' ? 'handle' : 'email')}
          style={{
            color: '#999',
            fontSize: '13px',
            cursor: 'pointer',
            marginTop: '16px',
          }}
        >
          {mode === 'email' ? 'Sign in with ATProto/Bluesky' : 'Sign in with Certified'}
        </p>

        <a
          href="/flow2"
          style={{
            display: 'inline-block',
            marginTop: '8px',
            color: '#bbb',
            fontSize: '12px',
            textDecoration: 'none',
          }}
        >
          Test Flow 2 (no email form)
        </a>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
