"use client"

import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'

/**
 * Flow 2 test page — "App has a simple login button"
 *
 * No email form on the client side. The client sends PAR with no login_hint,
 * so the auth server's own email form is shown to the user.
 *
 * See: https://github.com/hypercerts-org/ePDS/blob/main/docs/flows.md#flow-2
 */
function Flow2Login() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const [submitting, setSubmitting] = useState(false)

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

        <p style={{
          fontSize: '13px',
          color: '#999',
          marginBottom: '24px',
        }}>
          Flow 2 — auth server collects email
        </p>

        {error && (
          <div style={{
            background: '#fdf0f0',
            color: '#dc3545',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            marginBottom: '16px',
          }}>
            {decodeURIComponent(error)}
          </div>
        )}

        {/* No email field — just a login button. No login_hint sent to PAR. */}
        <form
          action="/api/oauth/login"
          method="GET"
          style={{ margin: '0 auto', maxWidth: '290px' }}
          onSubmit={() => { setTimeout(() => setSubmitting(true), 0) }}
        >
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
            {submitting ? 'Redirecting...' : (
              <>
                <img src="/certified-logo.png" alt="" style={{ height: '20px' }} />
                <span style={{ width: '12px' }}></span>
                Sign in with Certified
              </>
            )}
          </button>
        </form>

        <a
          href="/"
          style={{
            display: 'inline-block',
            marginTop: '16px',
            color: '#999',
            fontSize: '13px',
            textDecoration: 'none',
          }}
        >
          Switch to Flow 1 (email form)
        </a>
      </div>
    </div>
  )
}

export default function Flow2Page() {
  return (
    <Suspense>
      <Flow2Login />
    </Suspense>
  )
}
