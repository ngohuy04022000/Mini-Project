import { useState } from 'react';
import { Minus, Plus, ShoppingCart, XCircle } from 'lucide-react';
import type { TicketType } from '../types';
import { formatCurrency } from '../utils/format';

interface TicketCardProps {
  ticket: TicketType;
  onHold: (ticketTypeId: string, quantity: number) => Promise<void>;
  isLoading: boolean;
}

export function TicketCard({ ticket, onHold, isLoading }: TicketCardProps) {
  const [quantity, setQuantity] = useState(1);

  const availabilityPercent = (ticket.availableQuantity / ticket.totalQuantity) * 100;
  const isLowStock = ticket.availableQuantity > 0 && ticket.availableQuantity <= 20;

  function handleSubmit() {
    if (!ticket.isSoldOut && !isLoading) {
      onHold(ticket.id, quantity);
    }
  }

  return (
    <div
      className={`relative rounded-2xl border p-6 transition-all duration-300 ${
        ticket.isSoldOut
          ? 'border-gray-700 bg-gray-900/50 opacity-60'
          : 'border-pink-500/30 bg-gradient-to-br from-gray-900 to-gray-800 hover:border-pink-500/60 hover:shadow-lg hover:shadow-pink-500/10'
      }`}
    >
      {isLowStock && !ticket.isSoldOut && (
        <div className="absolute -top-2 right-4 rounded-full bg-orange-500 px-3 py-0.5 text-xs font-bold text-white">
          SẮP HẾT VÉ!
        </div>
      )}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">{ticket.name}</h3>
          {ticket.description && (
            <p className="mt-1 text-sm text-gray-400">{ticket.description}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-pink-400">{formatCurrency(ticket.price)}</p>
          <p className="text-xs text-gray-500">/vé</p>
        </div>
      </div>

      {/* Availability bar */}
      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-gray-400">Còn lại</span>
          <span className={ticket.isSoldOut ? 'text-red-400' : isLowStock ? 'text-orange-400' : 'text-green-400'}>
            {ticket.isSoldOut ? 'ĐÃ HẾT VÉ' : `${ticket.availableQuantity} / ${ticket.totalQuantity} vé`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-700">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              ticket.isSoldOut ? 'bg-red-600' : isLowStock ? 'bg-orange-500' : 'bg-green-500'
            }`}
            style={{ width: `${availabilityPercent}%` }}
          />
        </div>
      </div>

      {!ticket.isSoldOut ? (
        <div className="space-y-3">
          {/* Quantity selector */}
          <div className="flex items-center justify-between rounded-xl bg-gray-800 p-3">
            <span className="text-sm text-gray-400">Số lượng (tối đa {ticket.maxPerOrder})</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-600 text-gray-300 hover:border-pink-500 hover:text-pink-400 disabled:opacity-40"
                disabled={quantity <= 1 || isLoading}
              >
                <Minus size={14} />
              </button>
              <span className="w-6 text-center text-lg font-bold text-white">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => Math.min(ticket.maxPerOrder, q + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-600 text-gray-300 hover:border-pink-500 hover:text-pink-400 disabled:opacity-40"
                disabled={quantity >= ticket.maxPerOrder || isLoading}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between rounded-xl bg-pink-950/30 px-3 py-2">
            <span className="text-sm text-gray-400">Tổng</span>
            <span className="font-bold text-pink-300">{formatCurrency(ticket.price * quantity)}</span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-600 to-pink-500 py-3 font-semibold text-white transition-all hover:from-pink-500 hover:to-pink-400 hover:shadow-lg hover:shadow-pink-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <ShoppingCart size={18} />
                Chọn Vé
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-gray-800 py-3 text-gray-500">
          <XCircle size={18} />
          <span className="font-medium">Đã Hết Vé</span>
        </div>
      )}
    </div>
  );
}
