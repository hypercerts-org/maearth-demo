import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

async function signOut() {
  'use server'

  const cookieStore = await cookies()
  cookieStore.delete('user_did')
  cookieStore.delete('user_handle')
  redirect('/')
}

export default async function Welcome() {
  const cookieStore = await cookies()
  const userDid = cookieStore.get('user_did')?.value
  const userHandle = cookieStore.get('user_handle')?.value

  if (!userDid) {
    redirect('/')
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
        maxWidth: '520px',
        width: '100%',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontSize: '36px',
          fontWeight: 300,
          letterSpacing: '-0.5px',
          margin: '0 0 8px 0',
          color: '#2d2d2d',
        }}>
          Welcome to Ma Earth
        </h1>
        <p style={{
          fontSize: '17px',
          color: '#6b6b6b',
          lineHeight: 1.6,
          margin: '0 0 40px 0',
        }}>
          You are signed in.
        </p>

        <div style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '28px 32px',
          textAlign: 'left',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          marginBottom: '32px',
        }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Handle
            </div>
            <div style={{ fontSize: '17px', color: '#2d2d2d' }}>
              @{userHandle}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              DID
            </div>
            <div style={{
              fontSize: '13px',
              color: '#6b6b6b',
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
              wordBreak: 'break-all',
            }}>
              {userDid}
            </div>
          </div>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            style={{
              padding: '10px 24px',
              fontSize: '14px',
              color: '#4a6741',
              background: 'transparent',
              border: '1px solid #4a6741',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
