import { useState, FormEvent } from 'react';
import { CreditCard, User, Mail, CheckCircle } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import type { HoldResponse, PaymentResponse } from '../types';
import { processPayment } from '../services/api';

interface PaymentFormProps {
  hold: HoldResponse;
  onSuccess: (ticket: PaymentResponse) => void;
  onError: (message: string) => void;
}

export function PaymentForm({ hold, onSuccess, onError }: PaymentFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Prevent double-submit (spam click protection)
    if (isSubmitting || hasClicked) return;

    setIsSubmitting(true);
    setHasClicked(true);

    try {
      const ticket = await processPayment({
        holdId: hold.holdId,
        customerName: name.trim(),
        customerEmail: email.trim(),
      });
      onSuccess(ticket);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Thanh toán thất bại. Vui lòng thử lại.';
      onError(msg);
      setIsSubmitting(false);
      setHasClicked(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl bg-gray-800/50 p-4 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Loại vé</span>
          <span className="font-medium text-white">{hold.ticketTypeName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Số lượng</span>
          <span className="font-medium text-white">{hold.quantity} vé</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Đơn giá</span>
          <span className="font-medium text-white">{formatCurrency(hold.pricePerTicket)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-gray-700 pt-2">
          <span className="font-semibold text-white">Tổng cộng</span>
          <span className="text-lg font-bold text-pink-400">{formatCurrency(hold.totalPrice)}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Họ và tên *"
            required
            minLength={2}
            maxLength={100}
            className="w-full rounded-xl border border-gray-700 bg-gray-800 py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/50"
          />
        </div>

        <div className="relative">
          <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email nhận vé *"
            required
            className="w-full rounded-xl border border-gray-700 bg-gray-800 py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500/50"
          />
        </div>
      </div>

      <div className="rounded-xl bg-blue-950/30 px-4 py-3 text-xs text-blue-400">
        <p>* Đây là thanh toán giả lập. Nhấn "Xác Nhận" để hoàn tất đặt vé.</p>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || hasClicked || !name.trim() || !email.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 py-4 text-lg font-bold text-white transition-all hover:from-green-500 hover:to-emerald-400 hover:shadow-lg hover:shadow-green-500/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          <>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Đang xử lý...
          </>
        ) : (
          <>
            <CreditCard size={20} />
            Xác Nhận Thanh Toán
          </>
        )}
      </button>
    </form>
  );
}
