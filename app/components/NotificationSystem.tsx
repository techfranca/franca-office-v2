import { useState, useEffect } from 'react';
import { X, UserPlus, UserMinus } from 'lucide-react';

// 🔊 Sons de notificação (data URIs)
const NOTIFICATION_SOUND_DATA = {
  join: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFA==',
  leave: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFA=='
};

// Função helper para tocar som (só no cliente)
function playNotificationSound(type: 'join' | 'leave') {
  if (typeof window === 'undefined') return;
  
  try {
    const audio = new Audio(NOTIFICATION_SOUND_DATA[type]);
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch (e) {
    console.debug('Sound playback failed:', e);
  }
}

type NotificationType = 'join' | 'leave';

interface Notification {
  id: string;
  type: NotificationType;
  userName: string;
  roomName: string;
  timestamp: number;
}

interface NotificationSystemProps {
  enabled?: boolean;
  soundEnabled?: boolean;
  desktopEnabled?: boolean;
  onNotification?: (notification: Notification) => void;
}

let notificationId = 0;

export function useNotifications(props: NotificationSystemProps = {}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [newUsers, setNewUsers] = useState<Set<string>>(new Set());

  const settings = {
    enabled: props.enabled ?? true,
    soundEnabled: props.soundEnabled ?? true,
    desktopEnabled: props.desktopEnabled ?? false
  };

  const notify = (type: NotificationType, userName: string, roomName: string) => {
    if (!settings.enabled) return;

    const id = `notif-${Date.now()}-${notificationId++}`;
    const notification: Notification = {
      id,
      type,
      userName,
      roomName,
      timestamp: Date.now()
    };

    setNotifications(prev => [...prev, notification]);
    props.onNotification?.(notification);

    // Marca usuário como "novo" por 10s
    if (type === 'join') {
      setNewUsers(prev => new Set(prev).add(userName));
      setTimeout(() => {
        setNewUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(userName);
          return newSet;
        });
      }, 10000);
    }

    // Remove notificação após 5s
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);

    // Toca som
    if (settings.soundEnabled) {
      playNotificationSound(type);
    }

    // Notificação desktop
    if (settings.desktopEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Franca Office', {
        body: type === 'join' 
          ? `${userName} entrou em ${roomName}` 
          : `${userName} saiu de ${roomName}`,
        icon: '/logo.png',
        badge: '/logo.png'
      });
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return {
    notifications,
    newUsers,
    notify,
    removeNotification
  };
}

export function NotificationToasts({ 
  notifications, 
  onRemove 
}: { 
  notifications: Notification[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`p-4 rounded-xl border backdrop-blur-xl shadow-2xl animate-in slide-in-from-right duration-300 pointer-events-auto ${
            notification.type === 'join'
              ? 'bg-[#7DE08D]/10 border-[#7DE08D]/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}
        >
          <div className="flex items-start gap-3">
            {notification.type === 'join' ? (
              <UserPlus className="w-5 h-5 text-[#7DE08D] shrink-0 mt-0.5" />
            ) : (
              <UserMinus className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            )}
            
            <div className="flex-1 min-w-0">
              <p className={`font-bold ${
                notification.type === 'join' ? 'text-[#7DE08D]' : 'text-red-400'
              }`}>
                {notification.userName}
              </p>
              <p className="text-sm text-zinc-300">
                {notification.type === 'join' ? 'entrou em' : 'saiu de'} {notification.roomName}
              </p>
            </div>

            <button
              onClick={() => onRemove(notification.id)}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function NewUserBadge({ userName }: { userName: string }) {
  return (
    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-[#7DE08D] text-black text-[8px] font-bold rounded-full animate-pulse">
      NEW
    </span>
  );
}