import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TicketCountUpdate } from '../types';

interface SocketContextValue {
  isConnected: boolean;
  latestTicketCounts: TicketCountUpdate | null;
  onHoldExpired: (callback: (data: { holdId: string; sessionId: string }) => void) => () => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [latestTicketCounts, setLatestTicketCounts] = useState<TicketCountUpdate | null>(null);

  useEffect(() => {
    const socket = io('/', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('ticket_count_updated', (data: TicketCountUpdate) => {
      setLatestTicketCounts(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const onHoldExpired = useCallback(
    (callback: (data: { holdId: string; sessionId: string }) => void) => {
      const socket = socketRef.current;
      if (!socket) return () => {};
      socket.on('hold_expired', callback);
      return () => socket.off('hold_expired', callback);
    },
    [],
  );

  return (
    <SocketContext.Provider value={{ isConnected, latestTicketCounts, onHoldExpired }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
