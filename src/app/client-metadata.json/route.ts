import { NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  const baseUrl = getBaseUrl()

  const metadata = {
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
    email_template_uri: `${baseUrl}/email-template.html`,
    email_subject_template: '{{code}} — Your {{app_name}} code',
    brand_color: '#4a6741',
    background_color: '#F2EBE4',
  }

  return NextResponse.json(metadata, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
