import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowLeft, AlertTriangle, Ticket } from 'lucide-react';
import { CountdownTimer } from '../components/CountdownTimer';
import { PaymentForm } from '../components/PaymentForm';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { releaseHold, releaseHoldBeacon } from '../services/api';
import { useSocket } from '../contexts/SocketContext';
import { getSessionId } from '../utils/session';
import { formatDate } from '../utils/format';
import type { HoldResponse, PaymentResponse } from '../types';

type PageState =
  | { step: 'payment' }
  | { step: 'success'; ticket: PaymentResponse }
  | { step: 'expired' }
  | { step: 'error'; message: string };

export function BookingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const hold: HoldResponse | undefined = location.state?.hold;
  const { onHoldExpired } = useSocket();

  const [pageState, setPageState] = useState<PageState>({ step: 'payment' });
  const [isReleasing, setIsReleasing] = useState(false);

  // Track latest step + whether the hold was already released, so the
  // close/navigate-away cleanup reads current values without re-subscribing.
  const stepRef = useRef(pageState.step);
  const releasedRef = useRef(false);
  useEffect(() => {
    stepRef.current = pageState.step;
  }, [pageState]);

  useEffect(() => {
    if (!hold) {
      navigate('/', { replace: true });
      return;
    }

    // Listen for server-side hold expiry notification
    const unsubscribe = onHoldExpired(({ holdId, sessionId }) => {
      if (holdId === hold.holdId && sessionId === getSessionId()) {
        setPageState({ step: 'expired' });
      }
    });

    return unsubscribe;
  }, [hold, onHoldExpired, navigate]);

  // Free the held ticket immediately if the user closes the tab or navigates
  // away while still on the payment step (instead of waiting 5 min for expiry).
  useEffect(() => {
    if (!hold) return;

    const releaseIfPending = () => {
      if (stepRef.current === 'payment' && !releasedRef.current) {
        releasedRef.current = true;
        releaseHoldBeacon(hold.holdId);
      }
    };

    window.addEventListener('beforeunload', releaseIfPending);
    return () => {
      window.removeEventListener('beforeunload', releaseIfPending);
      releaseIfPending();
    };
  }, [hold]);

  if (!hold) return null;

  async function handleCancel() {
    if (isReleasing || pageState.step !== 'payment') return;
    setIsReleasing(true);
    releasedRef.current = true; // prevent the unmount cleanup from releasing again
    try {
      await releaseHold(hold!.holdId);
    } catch {
      // If release fails, the hold will expire naturally
    }
    navigate('/', { replace: true });
  }

  function handleExpire() {
    setPageState({ step: 'expired' });
  }

  function handlePaymentSuccess(ticket: PaymentResponse) {
    setPageState({ step: 'success', ticket });
  }

  function handlePaymentError(message: string) {
    setPageState({ step: 'error', message });
  }

  if (pageState.step === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-concert-dark px-4">
        <div className="w-full max-w-md rounded-2xl border border-green-800 bg-gradient-to-br from-green-950/30 to-concert-card p-8 text-center">
          <CheckCircle size={64} className="mx-auto mb-4 text-green-400" />
          <h1 className="mb-2 text-3xl font-black text-white">Đặt Vé Thành Công!</h1>
          <p className="mb-6 text-gray-400">Cảm ơn bạn đã đặt vé. Vui lòng kiểm tra email để nhận vé.</p>

          <div className="mb-6 rounded-xl bg-gray-800/50 p-4 text-left space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Khách hàng</span>
              <span className="font-medium text-white">{pageState.ticket.customerName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Email</span>
              <span className="font-medium text-white">{pageState.ticket.customerEmail}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Số lượng</span>
              <span className="font-medium text-white">{pageState.ticket.quantity} vé</span>
            </div>
            <div className="flex justify-between text-sm border-t border-gray-700 pt-2">
              <span className="font-semibold text-white">Tổng tiền</span>
              <span className="font-bold text-green-400">
                {pageState.ticket.totalAmount.toLocaleString('vi-VN')}đ
              </span>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-green-800 bg-green-950/30 p-4">
            <p className="text-xs text-green-500 mb-1">Mã vé của bạn</p>
            <p className="font-mono text-lg font-bold text-green-300 break-all">{pageState.ticket.ticketCode}</p>
          </div>

          <button
            onClick={() => navigate('/')}
            className="w-full rounded-xl bg-gradient-to-r from-pink-600 to-pink-500 py-3 font-semibold text-white hover:from-pink-500 hover:to-pink-400"
          >
            Về Trang Chủ
          </button>
        </div>
      </div>
    );
  }

  if (pageState.step === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-concert-dark px-4">
        <div className="w-full max-w-md rounded-2xl border border-orange-800 bg-concert-card p-8 text-center">
          <AlertTriangle size={64} className="mx-auto mb-4 text-orange-400" />
          <h1 className="mb-2 text-2xl font-black text-white">Hết Thời Gian Giữ Vé</h1>
          <p className="mb-6 text-gray-400">
            5 phút giữ vé đã trôi qua. Vé của bạn đã được trả lại vào kho.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full rounded-xl bg-gradient-to-r from-pink-600 to-pink-500 py-3 font-semibold text-white"
          >
            Chọn Lại Vé
          </button>
        </div>
      </div>
    );
  }

  const expiresInSeconds = Math.max(
    0,
    Math.floor((new Date(hold.expiresAt).getTime() - Date.now()) / 1000),
  );

  return (
    <div className="min-h-screen bg-concert-dark text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-concert-border bg-concert-dark/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Ticket className="text-pink-500" size={28} />
            <span className="text-xl font-bold">ConcertTix</span>
          </div>
          <ConnectionStatus />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <button
          onClick={handleCancel}
          disabled={isReleasing}
          className="mb-6 flex items-center gap-2 text-sm text-gray-400 hover:text-white disabled:opacity-50"
        >
          <ArrowLeft size={16} />
          Hủy và quay lại
        </button>

        <h1 className="mb-2 text-3xl font-black">Thanh Toán</h1>
        <p className="mb-6 text-gray-400">Vé đang được giữ cho bạn. Vui lòng hoàn tất trong thời gian quy định.</p>

        {/* Countdown Timer */}
        <div className="mb-6">
          <CountdownTimer expiresInSeconds={expiresInSeconds} onExpire={handleExpire} />
        </div>

        {/* Error display */}
        {pageState.step === 'error' && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-red-400">
            <AlertTriangle size={20} />
            <p>{pageState.message}</p>
            <button onClick={() => setPageState({ step: 'payment' })} className="ml-auto text-gray-500 hover:text-red-400">✕</button>
          </div>
        )}

        {/* Ticket Summary */}
        <div className="mb-6 rounded-2xl border border-concert-border bg-concert-card p-6">
          <h2 className="mb-4 text-lg font-bold">Thông Tin Đặt Vé</h2>
          <PaymentForm
            hold={hold}
            onSuccess={handlePaymentSuccess}
            onError={(msg) => setPageState({ step: 'error', message: msg })}
          />
        </div>

        <p className="text-center text-xs text-gray-600">
          Vé sẽ được giữ cho đến {new Date(hold.expiresAt).toLocaleTimeString('vi-VN')}
        </p>
      </div>
    </div>
  );
}
