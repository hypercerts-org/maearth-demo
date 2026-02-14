export default function Home() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px', paddingBottom: '20vh',
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

        <form action="/api/oauth/login" method="GET" style={{ margin: '0 auto', maxWidth: '290px' }}>
          <div style={{ marginBottom: '16px', textAlign: 'left' }}>
            <label htmlFor="email" style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              color: '#1A130F',
              marginBottom: '6px',
            }}>
              Email address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              autoFocus
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '12px 14px',
                fontSize: '16px',
                border: '1px solid #d4d0cb',
                borderRadius: '8px',
                outline: 'none',
                boxSizing: 'border-box',
                background: '#fff',
                color: '#1A130F',
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: '14px 28px',
              fontSize: '16px',
              fontWeight: 500,
              color: '#faf9f6',
              background: '#1A130F',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              letterSpacing: '0.3px',
            }}
          >
            <img src="/certified-logo.png" alt="" style={{ height: '20px' }} />
            <span style={{ width: '12px' }}></span>
            Sign in with Certified
          </button>
        </form>
      </div>
    </div>
  )
}
