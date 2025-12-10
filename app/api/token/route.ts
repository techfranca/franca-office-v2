import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get('room');
  const username = req.nextUrl.searchParams.get('username');

  if (!room || !username) {
    return NextResponse.json(
      { error: 'Parâmetros "room" e "username" são obrigatórios.' },
      { status: 400 },
    );
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json(
      { error: 'Chaves LiveKit não configuradas.' },
      { status: 500 },
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: username,
    name: username,
  });

  at.addGrant({
    roomJoin: true,
    room: room,
    canPublish: true,
    canSubscribe: true,
  });

  return NextResponse.json({ token: await at.toJwt() });
}