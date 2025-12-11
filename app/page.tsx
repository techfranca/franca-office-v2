"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useNotifications, NotificationToasts, NewUserBadge } from "./components/NotificationSystem"; 
import {
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
  useRoomContext,
  useLocalParticipant,
  useRemoteParticipants,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { 
  Coffee, Briefcase, Monitor, 
  ArrowRight, Lock, Unlock, User, ChevronDown, LogOut,
  CheckCircle2, MinusCircle, Utensils, Shield
} from "lucide-react";

// 🔐 CONFIGURAÇÃO DOS USUÁRIOS
const ALLOWED_USERS: Record<string, string> = {
  "Davidson": "dave@2025",
  "Gabriel": "gb@2025",
  "Bruna": "bruna@2025",
  "Guilherme": "gui@2025",
  "Leonardo": "leo@2025"
};

// 🏢 CONFIGURAÇÃO DAS SALAS
const ROOMS = [
  { id: "reuniao", name: "Sala de Reunião", icon: <Briefcase className="w-5 h-5" /> },
  { id: "reuniao-privada", name: "Sala de Reunião Privada", icon: <Shield className="w-5 h-5" />, isPrivate: true },
  { id: "cafe", name: "Área do Café", icon: <Coffee className="w-5 h-5" /> },
  { id: "gabriel", name: "Sala do Gabriel", icon: <Monitor className="w-5 h-5" /> },
  { id: "bruna", name: "Sala da Bruna", icon: <Monitor className="w-5 h-5" /> },
  { id: "leo", name: "Sala do Leonardo", icon: <Monitor className="w-5 h-5" /> },
  { id: "gui", name: "Sala do Guilherme", icon: <Monitor className="w-5 h-5" /> },
  { id: "davidson", name: "Sala do Davidson", icon: <Monitor className="w-5 h-5" /> },
];

// 🚦 STATUS DO USUÁRIO
type UserStatus = 'available' | 'focus' | 'lunch';
const STATUS_CONFIG = {
  available: { label: "Disponível", color: "bg-[#7DE08D]", icon: <CheckCircle2 className="w-3 h-3" /> },
  focus: { label: "Em Foco", color: "bg-red-500", icon: <MinusCircle className="w-3 h-3" /> },
  lunch: { label: "Almoço", color: "bg-yellow-500", icon: <Utensils className="w-3 h-3" /> },
};

export default function Home() {
  const [hasJoined, setHasJoined] = useState(false);
  const [currentRoom, setCurrentRoom] = useState("reuniao");
  
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  
  const [authenticatedUser, setAuthenticatedUser] = useState("");
  const [token, setToken] = useState("");
  const [occupancy, setOccupancy] = useState<Record<string, string[]>>({});
  
  const [myStatus, setMyStatus] = useState<UserStatus>('available');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [remoteStatuses, setRemoteStatuses] = useState<Record<string, UserStatus>>({});
  
  // 🔒 Estado da sala privada (sincronizado via LiveKit)
  const [privateRoomLocked, setPrivateRoomLocked] = useState(false);
  
  // 🔔 Sistema de Notificações
  const { notifications, newUsers, notify, removeNotification } = useNotifications({
    enabled: true,
    soundEnabled: true,
    desktopEnabled: false
  });

  // Radar de Presença
  useEffect(() => {
    const fetchOccupancy = async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        setOccupancy(data);
      } catch (e) { console.error(e); }
    };
    fetchOccupancy();
    const interval = setInterval(fetchOccupancy, 3000);
    return () => clearInterval(interval);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");

    if (!usernameInput || ALLOWED_USERS[usernameInput] !== passwordInput) {
      setLoginError(!usernameInput ? "Selecione um usuário." : "Senha incorreta.");
      return;
    }

    setAuthenticatedUser(usernameInput);
    if (typeof window !== 'undefined') {
      localStorage.setItem("office_user", usernameInput);
    }
    setHasJoined(true);
    joinRoom("reuniao", usernameInput);
  }

  async function joinRoom(roomName: string, userNameToUse?: string) {
    const user = userNameToUse || authenticatedUser;
    
    // 🔒 BLOQUEIO SERVER-SIDE: Verifica no servidor se a sala privada está trancada
    if (roomName === "reuniao-privada" && currentRoom !== "reuniao-privada") {
      try {
        const checkRes = await fetch(`/api/check-room?room=${roomName}`);
        const checkData = await checkRes.json();
        
        if (checkData.locked) {
          notify('leave', '🔒 Sala Privada Trancada', 'Apenas membros dentro podem acessar');
          return;
        }
      } catch (error) {
        console.error('Erro ao verificar status da sala:', error);
        // Em caso de erro, permite a entrada (fail-safe)
      }
    }
    
    // 1️⃣ LIMPA O TOKEN (força desmontagem do LiveKitRoom)
    setToken("");
    
    // 2️⃣ Aguarda um frame para garantir que o componente desmontou
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 3️⃣ Desconecta da sala anterior (se existir)
    if ((window as any).currentLiveKit) {
      try {
        await (window as any).currentLiveKit.disconnect();
        (window as any).currentLiveKit = null;
      } catch (e) { 
        console.error("Erro ao desconectar:", e); 
      }
    }
    
    // 4️⃣ Aguarda um pouco mais para garantir desconexão completa
    await new Promise(resolve => setTimeout(resolve, 200));

    // 5️⃣ Atualização Visual Imediata (Otimista)
    setOccupancy(prev => {
      const newOccupancy = { ...prev };
      
      Object.keys(newOccupancy).forEach(key => {
        if (Array.isArray(newOccupancy[key])) { 
          newOccupancy[key] = newOccupancy[key].filter(u => u !== user);
        }
      });

      if (!newOccupancy[roomName]) newOccupancy[roomName] = [];
      if (!newOccupancy[roomName].includes(user)) newOccupancy[roomName].push(user);
      return newOccupancy;
    });

    // 6️⃣ Atualiza a sala atual
    setCurrentRoom(roomName);

    // 7️⃣ Gera novo token e conecta
    try {
      const resp = await fetch(`/api/token?room=${roomName}&username=${user}`);
      const data = await resp.json();
      setToken(data.token);
    } catch (e) { 
      console.error("Erro ao gerar token:", e); 
    }
  }

  function handleLogout() {
    if ((window as any).currentLiveKit) {
      (window as any).currentLiveKit.disconnect();
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem("office_user");
    }
    setHasJoined(false);
    setToken("");
    setAuthenticatedUser("");
  }

  const activeRoomData = ROOMS.find(r => r.id === currentRoom);
  const isInPrivateRoom = currentRoom === "reuniao-privada";

  // 🟢 TELA DE LOGIN
  if (!hasJoined) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black relative overflow-hidden selection:bg-[#7DE08D] selection:text-black">
        <div className="absolute inset-0 w-full h-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px]"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(125,224,141,0.15)_0%,transparent_70%)]" />
        
        <div className="z-10 w-full max-w-[400px] p-8 bg-card/90 border border-zinc-800 rounded-2xl shadow-2xl backdrop-blur-xl">
          <div className="text-center mb-8">
            <div className="relative w-32 h-16 mx-auto mb-4">
              <Image src="/logo.png" alt="Logo Franca" fill className="object-contain" priority />
            </div>
            <p className="text-sm text-zinc-500 font-medium">Hub de Comunicação</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Quem é você?</label>
              <div className="relative group">
                <User className="absolute left-3 top-3 w-4 h-4 text-zinc-500 group-focus-within:text-[#7DE08D] transition-colors" />
                <select
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-black/50 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#7DE08D]/50 focus:ring-1 focus:ring-[#7DE08D]/50 transition-all text-sm appearance-none cursor-pointer hover:bg-zinc-900/50"
                >
                  <option value="" disabled className="text-zinc-500">Selecione seu perfil...</option>
                  {Object.keys(ALLOWED_USERS).map((user) => (
                    <option key={user} value={user} className="bg-zinc-900 text-white py-2">{user}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-zinc-600 pointer-events-none" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Senha de acesso</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-3 w-4 h-4 text-zinc-500 group-focus-within:text-[#7DE08D] transition-colors" />
                <input 
                  type="password" 
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-black/50 border border-zinc-800 rounded-lg text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#7DE08D]/50 focus:ring-1 focus:ring-[#7DE08D]/50 transition-all text-sm"
                />
              </div>
            </div>

            {loginError && (
              <div className="text-xs text-red-400 bg-red-500/5 p-3 rounded-lg text-center border border-red-500/10 font-medium">
                {loginError}
              </div>
            )}

            <button 
              type="submit" 
              disabled={!usernameInput || !passwordInput} 
              className="w-full bg-[#7DE08D] text-black font-bold py-3 rounded-lg hover:bg-[#6bd67b] hover:shadow-[0_0_20px_-5px_rgba(125,224,141,0.4)] transition-all flex items-center justify-center gap-2 mt-4 text-sm disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed"
            >
              Acessar Workspace <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          
          <div className="mt-8 flex justify-center">
            <div className="h-1 w-12 bg-zinc-800 rounded-full"></div>
          </div>
        </div>
      </div>
    );
  }

  // 🟢 O ESCRITÓRIO
  return (
    <div className="flex h-screen bg-black text-zinc-100 font-sans overflow-hidden selection:bg-[#7DE08D] selection:text-black">
      
      {/* SIDEBAR */}
      <aside className="w-[260px] bg-[#050505] border-r border-zinc-900 flex flex-col z-20 shrink-0">
        <div className="p-5 pb-2">
          <div className="flex items-center gap-3 mb-8 pl-1">
            <div className="relative w-28 h-10">
              <Image src="/logo.png" alt="Logo Franca" fill className="object-contain object-left" priority />
            </div>
          </div>
          
          {/* CARD DE STATUS DO USUÁRIO */}
          <div className="relative">
            <div 
              className="px-3 py-2 bg-card rounded-lg border border-zinc-800 mb-6 flex items-center gap-3 cursor-pointer hover:border-zinc-700 transition-colors"
              onClick={() => setShowStatusMenu(!showStatusMenu)}
            >
              <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-white relative">
                {authenticatedUser.charAt(0).toUpperCase()}
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 ${STATUS_CONFIG[myStatus].color} border-2 border-card rounded-full`}></span>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className={`text-[10px] uppercase font-bold tracking-wider ${myStatus === 'available' ? 'text-[#7DE08D]' : myStatus === 'focus' ? 'text-red-500' : 'text-yellow-500'}`}>
                  {STATUS_CONFIG[myStatus].label}
                </p>
                <p className="text-sm font-medium text-white truncate">{authenticatedUser}</p>
              </div>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </div>

            {/* Menu de Troca de Status */}
            {showStatusMenu && (
              <div className="absolute top-full left-0 w-full bg-card border border-zinc-800 rounded-lg shadow-xl z-50 overflow-hidden mb-2">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setMyStatus(key as UserStatus);
                      setShowStatusMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-900 transition-colors text-left"
                  >
                    <span className={`w-2 h-2 rounded-full ${config.color}`} />
                    <span className="text-xs font-medium text-zinc-300">{config.label}</span>
                    {myStatus === key && <CheckCircle2 className="w-3 h-3 ml-auto text-white" />}
                  </button>
                ))}
                <div className="h-px bg-zinc-800 my-1"></div>
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-900/20 text-red-400 transition-colors text-left"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="text-xs font-medium">Sair</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 px-3 space-y-1 overflow-y-auto">
          <p className="px-3 text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Ambientes</p>
          {ROOMS.map((room) => {
            const isActive = currentRoom === room.id;
            const usersInRoom = occupancy[room.id] || [];
            const isPrivateRoom = room.id === "reuniao-privada";
            const isLocked = isPrivateRoom && privateRoomLocked;
            
            return (
              <button
                key={room.id}
                onClick={() => joinRoom(room.id)}
                disabled={isLocked && !isActive}
                className={`w-full flex flex-col items-start gap-1 px-3 py-2.5 rounded-lg transition-all duration-200 group relative
                  ${isActive 
                    ? "bg-[#7DE08D]/10 text-[#7DE08D] border border-[#7DE08D]/20 shadow-[0_0_15px_rgba(125,224,141,0.1)]" 
                    : isLocked
                    ? "text-zinc-700 border border-transparent cursor-not-allowed opacity-50"
                    : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200 border border-transparent"
                  }`}
              >
                <div className="flex items-center gap-3 w-full">
                  <span className={isActive ? "text-[#7DE08D]" : "group-hover:text-white transition-colors"}>{room.icon}</span>
                  <span className="font-medium text-sm">{room.name}</span>
                  {isLocked && !isActive && <Lock className="w-3 h-3 ml-auto text-red-500" />}
                  {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#7DE08D] shadow-[0_0_8px_rgba(125,224,141,0.6)]" />}
                </div>

                {usersInRoom.length > 0 && (
                  <div className="flex items-center gap-1 pl-8 mt-1 flex-wrap">
                    {usersInRoom.map((u, idx) => {
                      const isMe = u === authenticatedUser;
                      const userStatus = isMe ? myStatus : (remoteStatuses[u] || 'available');
                      const statusColor = STATUS_CONFIG[userStatus].color;
                      const isNewUser = newUsers.has(u);
                      
                      return (
                        <div 
                          key={idx} 
                          className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[8px] font-bold text-white shadow-sm relative"
                          title={`${u} - ${STATUS_CONFIG[userStatus].label}`}
                        >
                          {u.charAt(0).toUpperCase()}
                          <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 ${statusColor} rounded-full border border-zinc-900`}></span>
                          {isNewUser && <NewUserBadge userName={u} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 flex flex-col relative bg-black overflow-hidden">
        <div className="absolute inset-0 w-full h-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px] pointer-events-none opacity-50"></div>

        <header className="h-14 border-b border-zinc-900 flex items-center px-6 justify-between bg-black/50 backdrop-blur-sm shrink-0 relative z-10">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-[#7DE08D]`}>
              {activeRoomData?.icon}
            </div>
            <h2 className="text-sm font-bold text-white">{activeRoomData?.name}</h2>
            {isInPrivateRoom && privateRoomLocked && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                <Lock className="w-3 h-3 text-red-500" />
                <span className="text-[10px] font-bold text-red-500">TRANCADA</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
             <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${myStatus === 'available' ? 'bg-[#7DE08D]/10 border-[#7DE08D]/20' : 'bg-zinc-800 border-zinc-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[myStatus].color} animate-pulse`}></span>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${myStatus === 'available' ? 'text-[#7DE08D]' : 'text-zinc-400'}`}>
                  {STATUS_CONFIG[myStatus].label}
                </span>
             </div>
          </div>
        </header>

        {/* VÍDEO + CONTROLES */}
        <div className="flex-1 p-4 flex flex-col gap-4 overflow-hidden relative z-10">
          {!token ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-4 animate-pulse">
              <div className="w-8 h-8 border-2 border-[#7DE08D] border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">Conectando...</p>
            </div>
          ) : (
            <LiveKitRoom
              video={true}
              audio={true}
              token={token}
              serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
              data-lk-theme="default"
              style={{ height: "100%", display: "flex", flexDirection: "column" }}
            >
              <RoomActiveTracker />
              <LocalStatusUpdater status={myStatus} />
              <RemoteStatusTracker onStatusUpdate={setRemoteStatuses} />
              <NotificationTracker currentRoom={currentRoom} onNotify={notify} />
              <PrivateRoomLockManager 
                currentRoom={currentRoom}
                isLocked={privateRoomLocked}
                onLockChange={setPrivateRoomLocked}
              />
              
              <div className="flex-1 rounded-xl overflow-hidden border border-zinc-900 bg-card/80 shadow-2xl relative min-h-0 backdrop-blur-sm">
                 <MyVideoConference />
              </div>
              
              <div className="h-16 flex items-center justify-center mt-2 shrink-0">
                 <ControlBar 
                    variation="minimal" 
                    controls={{ microphone: true, camera: true, screenShare: true, chat: false }}
                 /> 
              </div>
              <RoomAudioRenderer />
            </LiveKitRoom>
          )}
        </div>
      </main>
      
      {/* 🔔 Toasts de Notificação */}
      <NotificationToasts 
        notifications={notifications} 
        onRemove={removeNotification} 
      />
    </div>
  );
}

// Helpers
function RoomActiveTracker() {
  const room = useRoomContext();
  useEffect(() => {
    if (room) {
      (window as any).currentLiveKit = room;
    }
  }, [room]);
  return null;
}

function LocalStatusUpdater({ status }: { status: UserStatus }) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    if (!room) return;
    
    const handleConnected = () => setIsConnected(true);
    const handleDisconnected = () => setIsConnected(false);
    
    if (room.state === 'connected') {
      setIsConnected(true);
    }
    
    room.on('connected', handleConnected);
    room.on('disconnected', handleDisconnected);
    
    return () => {
      room.off('connected', handleConnected);
      room.off('disconnected', handleDisconnected);
    };
  }, [room]);
  
  useEffect(() => {
    if (!localParticipant || !isConnected) return;
    
    const updateMetadata = async () => {
      try {
        const metadata = JSON.stringify({ status });
        await Promise.race([
          localParticipant.setMetadata(metadata),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
      } catch (error) {
        console.debug('Status update skipped:', error instanceof Error ? error.message : 'unknown');
      }
    };
    
    const timeoutId = setTimeout(updateMetadata, 500);
    return () => clearTimeout(timeoutId);
    
  }, [localParticipant, status, isConnected]);
  
  return null;
}

function NotificationTracker({ 
  currentRoom, 
  onNotify 
}: { 
  currentRoom: string;
  onNotify: (type: 'join' | 'leave', userName: string, roomName: string) => void;
}) {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const previousParticipantsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!room) return;

    const currentParticipants = new Set(
      remoteParticipants.map(p => p.identity)
    );

    const previous = previousParticipantsRef.current;

    currentParticipants.forEach(identity => {
      if (!previous.has(identity)) {
        const roomName = ROOMS.find(r => r.id === currentRoom)?.name || currentRoom;
        onNotify('join', identity, roomName);
      }
    });

    previous.forEach(identity => {
      if (!currentParticipants.has(identity)) {
        const roomName = ROOMS.find(r => r.id === currentRoom)?.name || currentRoom;
        onNotify('leave', identity, roomName);
      }
    });

    previousParticipantsRef.current = currentParticipants;
    
  }, [remoteParticipants, room, currentRoom, onNotify]);

  return null;
}

function RemoteStatusTracker({ onStatusUpdate }: { onStatusUpdate: (statuses: Record<string, UserStatus>) => void }) {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();

  useEffect(() => {
    if (!room) return;

    const updateStatuses = () => {
      const statuses: Record<string, UserStatus> = {};
      
      room.remoteParticipants.forEach(participant => {
        if (participant.metadata) {
          try {
            const metadata = JSON.parse(participant.metadata);
            statuses[participant.identity] = metadata.status || 'available';
          } catch (e) {
            statuses[participant.identity] = 'available';
          }
        } else {
          statuses[participant.identity] = 'available';
        }
      });
      
      onStatusUpdate(statuses);
    };

    room.on('participantMetadataChanged', updateStatuses);
    room.on('participantConnected', updateStatuses);
    room.on('participantDisconnected', updateStatuses);

    updateStatuses();

    return () => {
      room.off('participantMetadataChanged', updateStatuses);
      room.off('participantConnected', updateStatuses);
      room.off('participantDisconnected', updateStatuses);
    };
  }, [room, onStatusUpdate, remoteParticipants]);

  return null;
}

// 🔒 GERENCIADOR DE LOCK DA SALA PRIVADA (dentro do LiveKitRoom)
function PrivateRoomLockManager({ 
  currentRoom,
  isLocked,
  onLockChange 
}: { 
  currentRoom: string;
  isLocked: boolean;
  onLockChange: (locked: boolean) => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [showButton, setShowButton] = useState(false);

  // Mostra botão apenas quando estiver na sala privada
  useEffect(() => {
    setShowButton(currentRoom === 'reuniao-privada');
  }, [currentRoom]);

  // Sincroniza o estado do lock lendo metadata de todos os participantes
  useEffect(() => {
    if (!room || currentRoom !== 'reuniao-privada') return;

    const updateLockStatus = () => {
      const participants = Array.from(room.remoteParticipants.values());
      const localP = room.localParticipant;
      
      let foundLockStatus = false;
      
      [localP, ...participants].forEach(participant => {
        if (participant?.metadata) {
          try {
            const metadata = JSON.parse(participant.metadata);
            if (metadata.roomLocked !== undefined) {
              onLockChange(metadata.roomLocked);
              foundLockStatus = true;
            }
          } catch (e) {
            // Ignora
          }
        }
      });

      if (!foundLockStatus) {
        onLockChange(false);
      }
    };

    room.on('participantMetadataChanged', updateLockStatus);
    room.on('participantConnected', updateLockStatus);
    room.on('participantDisconnected', updateLockStatus);

    updateLockStatus();

    return () => {
      room.off('participantMetadataChanged', updateLockStatus);
      room.off('participantConnected', updateLockStatus);
      room.off('participantDisconnected', updateLockStatus);
    };
  }, [room, currentRoom, onLockChange]);

  const toggleLock = async () => {
    if (!localParticipant || !room) return;

    const newLockState = !isLocked;
    
    try {
      const currentMetadata = localParticipant.metadata 
        ? JSON.parse(localParticipant.metadata) 
        : {};
      
      const newMetadata = {
        ...currentMetadata,
        roomLocked: newLockState
      };

      await localParticipant.setMetadata(JSON.stringify(newMetadata));
      onLockChange(newLockState);
    } catch (error) {
      console.error('Erro ao atualizar lock:', error);
    }
  };

  if (!showButton) return null;

  return (
    <div className="absolute top-4 right-4 z-50">
      <button
        onClick={toggleLock}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all shadow-lg ${
          isLocked 
            ? 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20' 
            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'
        }`}
      >
        {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        <span className="text-[10px] font-bold uppercase tracking-wide">
          {isLocked ? 'Trancada' : 'Aberta'}
        </span>
      </button>
    </div>
  );
}

function MyVideoConference() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  
  const remoteParticipants = useRemoteParticipants();
  const room = useRoomContext();
  const [participantMetadata, setParticipantMetadata] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!room) return;

    const handleMetadataChanged = (metadata: string | undefined, participant: any) => {
      if (metadata) {
        try {
          const parsed = JSON.parse(metadata);
          setParticipantMetadata(prev => ({
            ...prev,
            [participant.identity]: parsed
          }));
        } catch (e) {
          console.debug('Invalid metadata:', e);
        }
      }
    };

    room.on('participantMetadataChanged', handleMetadataChanged);

    room.remoteParticipants.forEach(participant => {
      if (participant.metadata) {
        handleMetadataChanged(participant.metadata, participant);
      }
    });

    return () => {
      room.off('participantMetadataChanged', handleMetadataChanged);
    };
  }, [room]);

  const screenShareTrack = tracks.find(t => t.source === Track.Source.ScreenShare);

  if (screenShareTrack) {
    const otherTracks = tracks.filter(t => t !== screenShareTrack);
    
    return (
      <div className="flex flex-col h-full w-full p-2 gap-2">
        <div className="flex-1 rounded-lg overflow-hidden border border-[#7DE08D]/30 shadow-2xl relative">
           <ParticipantTile 
              trackRef={screenShareTrack} 
              className="w-full h-full"
           />
           <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-[10px] text-white font-bold border border-zinc-700">
              Apresentando
           </div>
        </div>
        
        <div className="h-32 flex gap-2 overflow-x-auto pb-1">
          {otherTracks.map((track) => {
            const participant = track.participant;
            const metadata = participantMetadata[participant.identity] || 
                           (participant.metadata ? JSON.parse(participant.metadata) : null);
            const userStatus = metadata?.status || 'available';
            
            return (
              <div key={track.publication?.trackSid || track.participant.identity} className="w-48 shrink-0 relative">
                <ParticipantTile 
                  trackRef={track}
                  className="rounded-lg overflow-hidden border border-zinc-800 bg-card shadow-lg h-full"
                />
                <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-[8px] font-bold ${STATUS_CONFIG[userStatus as UserStatus].color} flex items-center gap-1 backdrop-blur-sm`}>
                  {STATUS_CONFIG[userStatus as UserStatus].icon}
                  <span className="text-black">{STATUS_CONFIG[userStatus as UserStatus].label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const getGridLayout = (count: number) => {
    if (count === 1) return { cols: 1, rows: 1 };
    if (count === 2) return { cols: 2, rows: 1 };
    if (count === 3) return { cols: 3, rows: 1 };
    if (count === 4) return { cols: 2, rows: 2 };
    if (count === 5) return { cols: 3, rows: 2 };
    if (count === 6) return { cols: 3, rows: 2 };
    return { cols: 3, rows: Math.ceil(count / 3) };
  };

  const layout = getGridLayout(tracks.length);
  
  return (
    <div 
      className="grid h-full w-full p-2 gap-4"
      style={{
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
      }}
    >
      {tracks.map((track, index) => {
        const participant = track.participant;
        const metadata = participantMetadata[participant.identity] || 
                       (participant.metadata ? JSON.parse(participant.metadata) : null);
        const userStatus = metadata?.status || 'available';
        
        const isLastOdd = tracks.length % 2 !== 0 && index === tracks.length - 1 && tracks.length > 2;
        
        return (
          <div 
            key={track.publication?.trackSid || track.participant.identity} 
            className="relative"
            style={isLastOdd ? {
              gridColumn: `span ${Math.min(layout.cols, 2)}`,
              gridColumnStart: layout.cols === 3 ? 2 : 1
            } : undefined}
          >
            <ParticipantTile 
              trackRef={track}
              className="rounded-lg overflow-hidden border border-zinc-800 bg-card shadow-lg h-full w-full"
            />
            <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-[8px] font-bold ${STATUS_CONFIG[userStatus as UserStatus].color} flex items-center gap-1 backdrop-blur-sm`}>
              {STATUS_CONFIG[userStatus as UserStatus].icon}
              <span className="text-black">{STATUS_CONFIG[userStatus as UserStatus].label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}