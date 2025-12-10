import { RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json({ error: 'Chaves não configuradas' }, { status: 500 });
  }

  const roomService = new RoomServiceClient(wsUrl, apiKey, apiSecret);
  
  // Salas corretas do seu page.tsx
  const roomNames = ['reuniao', 'cafe', 'gabriel', 'bruna', 'leo', 'gui', 'davidson'];
  const occupancy: Record<string, string[]> = {};

  try {
    await Promise.all(
      roomNames.map(async (room) => {
        try {
          const participants = await roomService.listParticipants(room);
          occupancy[room] = participants
            .map((p) => p.identity)
            .filter((id) => id !== undefined);
        } catch (error) {
          // Se a sala não existir (vazia), retorna lista vazia
          occupancy[room] = [];
        }
      })
    );

    return NextResponse.json(occupancy);
  } catch (error) {
    console.error("Erro ao buscar status:", error);
    return NextResponse.json({ error: 'Falha ao buscar status' }, { status: 500 });
  }
}