import { RoomServiceClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const room = request.nextUrl.searchParams.get('room');
  
  if (room !== 'reuniao-privada') {
    return NextResponse.json({ locked: false });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json({ error: 'Configuração inválida' }, { status: 500 });
  }

  try {
    const roomService = new RoomServiceClient(wsUrl, apiKey, apiSecret);
    const participants = await roomService.listParticipants('reuniao-privada');
    
    // Checa se algum participante tem metadata com roomLocked: true
    const isLocked = participants.some(p => {
      if (!p.metadata) return false;
      try {
        const metadata = JSON.parse(p.metadata);
        return metadata.roomLocked === true;
      } catch {
        return false;
      }
    });

    return NextResponse.json({ locked: isLocked });
    
  } catch (error) {
    // Se a sala não existe, não está trancada
    return NextResponse.json({ locked: false });
  }
}