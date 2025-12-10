import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';

export async function GET(request: NextRequest) {
  const room = request.nextUrl.searchParams.get('room');
  const username = request.nextUrl.searchParams.get('username');

  if (!room || !username) {
    return NextResponse.json(
      { error: 'Parâmetros room e username são obrigatórios' },
      { status: 400 }
    );
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Credenciais do LiveKit não configuradas' },
      { status: 500 }
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: username,
  });

  // ✅ PERMISSÕES COMPLETAS
  const grants = {
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  };

  at.addGrant(grants);

  // 🔍 DEBUG TEMPORÁRIO - REMOVA DEPOIS
  console.log('🔑 Token gerado para:', {
    username,
    room,
    grants,
    hasMetadataPermission: grants.canUpdateOwnMetadata
  });

  const token = await at.toJwt();
  return NextResponse.json({ token });
}