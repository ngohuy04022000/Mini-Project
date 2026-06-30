import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fetchActiveEvent } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import type { Event, TicketType } from '../types';

export function useEvent() {
  const { latestTicketCounts } = useSocket();
  const query = useQuery({
    queryKey: ['active-event'],
    queryFn: fetchActiveEvent,
    staleTime: 30000,
    refetchInterval: 60000, // Fallback polling every 60s
  });

  const [event, setEvent] = useState<Event | null>(null);

  useEffect(() => {
    if (query.data) {
      setEvent(query.data);
    }
  }, [query.data]);

  // Update ticket counts from WebSocket without full refetch
  useEffect(() => {
    if (!latestTicketCounts || !event) return;

    setEvent((prev) => {
      if (!prev) return prev;
      const updatedTicketTypes = prev.ticketTypes.map((tt) => {
        const update = latestTicketCounts.ticketCounts.find((tc) => tc.id === tt.id);
        if (!update) return tt;
        return {
          ...tt,
          availableQuantity: update.availableQuantity,
          isSoldOut: update.availableQuantity === 0,
        };
      });
      return { ...prev, ticketTypes: updatedTicketTypes };
    });
  }, [latestTicketCounts]);

  return {
    event,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
