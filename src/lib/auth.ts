import { NodeOAuthClient, type NodeSavedSession, type NodeSavedState } from '@atproto/oauth-client-node'

let client: NodeOAuthClient | null = null

export function getBaseUrl(): string {
  return process.env.PUBLIC_URL || 'http://localhost:3000'
}

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (client) return client

  const baseUrl = getBaseUrl()

  client = new NodeOAuthClient({
    clientMetadata: {
      client_id: `${baseUrl}/client-metadata.json`,
      client_name: 'Ma Earth',
      client_uri: baseUrl,
      logo_uri: `${baseUrl}/logo.png`,
      redirect_uris: [`${baseUrl}/api/oauth/callback`],
      scope: 'atproto transition:generic',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      dpop_bound_access_tokens: true,
    },
    stateStore: {
      async set(key: string, state: NodeSavedState) {
        stateMap.set(key, state)
      },
      async get(key: string): Promise<NodeSavedState | undefined> {
        return stateMap.get(key)
      },
      async del(key: string) {
        stateMap.delete(key)
      },
    },
    sessionStore: {
      async set(sub: string, session: NodeSavedSession) {
        sessionMap.set(sub, session)
      },
      async get(sub: string): Promise<NodeSavedSession | undefined> {
        return sessionMap.get(sub)
      },
      async del(sub: string) {
        sessionMap.delete(sub)
      },
    },
  })

  return client
}

// In-memory stores (fine for demo, use persistent storage in production)
const stateMap = new Map<string, NodeSavedState>()
const sessionMap = new Map<string, NodeSavedSession>()
