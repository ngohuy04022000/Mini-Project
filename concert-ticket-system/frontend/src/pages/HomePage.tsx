import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Users, Ticket, AlertTriangle } from 'lucide-react';
import { useEvent } from '../hooks/useEvent';
import { TicketCard } from '../components/TicketCard';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { holdTicket } from '../services/api';
import { formatDate, formatCurrency } from '../utils/format';
import type { HoldResponse } from '../types';

export function HomePage() {
  const { event, isLoading, error } = useEvent();
  const navigate = useNavigate();
  const [holdingTicketId, setHoldingTicketId] = useState<string | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);

  async function handleHold(ticketTypeId: string, quantity: number) {
    setHoldError(null);
    setHoldingTicketId(ticketTypeId);
    try {
      const hold: HoldResponse = await holdTicket({ ticketTypeId, quantity });
      navigate('/booking', { state: { hold } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể giữ vé. Vui lòng thử lại.';
      setHoldError(msg);
    } finally {
      setHoldingTicketId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-concert-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-pink-500 border-t-transparent" />
          <p className="text-gray-400">Đang tải thông tin sự kiện...</p>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-concert-dark">
        <div className="rounded-2xl border border-red-800 bg-red-950/30 p-8 text-center">
          <AlertTriangle size={48} className="mx-auto mb-4 text-red-400" />
          <p className="text-red-300">Không thể tải thông tin sự kiện</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-red-600 px-6 py-2 text-white hover:bg-red-500"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  const totalAvailable = event.ticketTypes.reduce((sum, tt) => sum + tt.availableQuantity, 0);
  const totalTickets = event.ticketTypes.reduce((sum, tt) => sum + tt.totalQuantity, 0);

  return (
    <div className="min-h-screen bg-concert-dark text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-concert-border bg-concert-dark/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Ticket className="text-pink-500" size={28} />
            <span className="text-xl font-bold">ConcertTix</span>
          </div>
          <div className="flex items-center gap-4">
            <ConnectionStatus />
            <a
              href="/lookup"
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-gray-500 hover:text-white"
            >
              Tra cứu vé
            </a>
            <a
              href="/admin"
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:border-gray-500 hover:text-white"
            >
              Admin
            </a>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="relative overflow-hidden">
        {event.imageUrl && (
          <img
            src={event.imageUrl}
            alt={event.name}
            className="h-80 w-full object-cover opacity-40"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-concert-dark via-concert-dark/50 to-transparent" />
        <div className="absolute inset-0 flex items-end">
          <div className="mx-auto w-full max-w-6xl px-4 pb-8">
            <h1 className="text-4xl font-black leading-tight md:text-5xl">{event.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-300">
              <span className="flex items-center gap-1.5">
                <Calendar size={16} className="text-pink-400" />
                {formatDate(event.eventDate)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={16} className="text-pink-400" />
                {event.venue}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Stats Bar */}
        <div className="mb-8 flex flex-wrap items-center gap-4 rounded-2xl border border-concert-border bg-concert-card p-4">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-pink-400" />
            <div>
              <p className="text-xs text-gray-500">Vé còn lại</p>
              <p className={`text-xl font-bold ${totalAvailable === 0 ? 'text-red-400' : totalAvailable <= 50 ? 'text-orange-400' : 'text-green-400'}`}>
                {totalAvailable.toLocaleString('vi-VN')} / {totalTickets.toLocaleString('vi-VN')}
              </p>
            </div>
          </div>

          {totalAvailable > 0 && totalAvailable <= 50 && (
            <div className="ml-auto flex items-center gap-2 rounded-full bg-orange-950/50 px-3 py-1 text-sm text-orange-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-orange-400" />
              Chỉ còn {totalAvailable} vé - Nhanh lên!
            </div>
          )}

          {totalAvailable === 0 && (
            <div className="ml-auto rounded-full bg-red-950/50 px-3 py-1 text-sm font-bold text-red-400">
              ĐÃ HẾT VÉ
            </div>
          )}
        </div>

        {/* Hold Error */}
        {holdError && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-red-400">
            <AlertTriangle size={20} />
            <p>{holdError}</p>
            <button onClick={() => setHoldError(null)} className="ml-auto text-gray-500 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Event Description */}
        {event.description && (
          <div className="mb-8 rounded-2xl border border-concert-border bg-concert-card p-6">
            <h2 className="mb-2 font-bold text-white">Về sự kiện</h2>
            <p className="text-gray-400 leading-relaxed">{event.description}</p>
          </div>
        )}

        {/* Ticket Types */}
        <h2 className="mb-4 text-2xl font-bold">Chọn Loại Vé</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {event.ticketTypes.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onHold={handleHold}
              isLoading={holdingTicketId === ticket.id}
            />
          ))}
        </div>

        {/* Price range info */}
        <div className="mt-8 rounded-2xl border border-concert-border bg-concert-card p-4 text-center text-sm text-gray-500">
          <p>
            Giá vé từ{' '}
            <span className="text-pink-400 font-medium">
              {formatCurrency(Math.min(...event.ticketTypes.map((t) => t.price)))}
            </span>{' '}
            đến{' '}
            <span className="text-pink-400 font-medium">
              {formatCurrency(Math.max(...event.ticketTypes.map((t) => t.price)))}
            </span>
          </p>
          <p className="mt-1">Sau khi chọn vé, bạn có 5 phút để hoàn tất thanh toán.</p>
        </div>
      </div>
    </div>
  );
}
