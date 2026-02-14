import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function Home() {
  const cookieStore = await cookies()
  const userDid = cookieStore.get('user_did')?.value

  if (userDid) {
    redirect('/welcome')
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: '440px',
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{
            fontSize: '42px',
            fontWeight: 300,
            letterSpacing: '-0.5px',
            margin: '0 0 12px 0',
            color: '#2d2d2d',
          }}>
            Ma Earth
          </h1>
          <p style={{
            fontSize: '17px',
            color: '#6b6b6b',
            lineHeight: 1.6,
            margin: 0,
          }}>
            Nourishing people and planet
          </p>
        </div>

        <a
          href="/api/oauth/login"
          style={{
            display: 'block',
            width: '100%',
            padding: '14px 28px',
            fontSize: '16px',
            fontWeight: 500,
            color: '#faf9f6',
            background: '#4a6741',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            letterSpacing: '0.3px',
            textDecoration: 'none',
            boxSizing: 'border-box',
          }}
        >
          Sign in
        </a>

        <p style={{
          marginTop: '32px',
          fontSize: '13px',
          color: '#999',
          lineHeight: 1.5,
        }}>
          Sign in with your Certified identity.
          <br />
          Powered by the AT Protocol.
        </p>
      </div>
    </div>
  )
}
