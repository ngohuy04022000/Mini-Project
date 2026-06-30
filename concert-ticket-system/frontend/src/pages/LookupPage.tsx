import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ticket,
  ArrowLeft,
  Search,
  CheckCircle,
  AlertTriangle,
  MapPin,
  Calendar,
  User,
  Mail,
} from 'lucide-react';
import { lookupTicket } from '../services/api';
import { formatCurrency, formatDate } from '../utils/format';
import { ConnectionStatus } from '../components/ConnectionStatus';
import type { TicketLookupResult } from '../types';

const STATUS_LABELS: Record<TicketLookupResult['status'], { label: string; color: string }> = {
  SOLD: { label: 'Hợp lệ', color: 'text-green-400' },
  REFUNDED: { label: 'Đã hoàn tiền', color: 'text-yellow-400' },
  CANCELLED: { label: 'Đã hủy', color: 'text-red-400' },
};

export function LookupPage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<TicketLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const ticket = await lookupTicket(trimmed);
      setResult(ticket);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không tìm thấy vé.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  const statusInfo = result ? STATUS_LABELS[result.status] : null;

  return (
    <div className="min-h-screen bg-concert-dark text-white">
      <header className="sticky top-0 z-50 border-b border-concert-border bg-concert-dark/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
            <ArrowLeft size={16} />
            Trang chủ
          </Link>
          <div className="flex items-center gap-2">
            <Ticket className="text-pink-500" size={24} />
            <span className="text-lg font-bold">Tra cứu vé</span>
          </div>
          <ConnectionStatus />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-2 text-3xl font-black">Tra Cứu Vé Của Bạn</h1>
        <p className="mb-6 text-gray-400">
          Nhập mã vé (ticket code) bạn nhận được sau khi đặt vé thành công để kiểm tra thông tin.
        </p>

        <form onSubmit={handleSearch} className="mb-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Ví dụ: 902b8f8d-2ee9-4b2f-84db-4f88ffd812fe"
            className="flex-1 rounded-xl border border-concert-border bg-concert-card px-4 py-3 font-mono text-sm text-white placeholder-gray-600 outline-none focus:border-pink-500"
          />
          <button
            type="submit"
            disabled={isLoading || !code.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-600 to-pink-500 px-6 py-3 font-semibold text-white hover:from-pink-500 hover:to-pink-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search size={18} />
            {isLoading ? 'Đang tìm...' : 'Tra cứu'}
          </button>
        </form>

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-800 bg-red-950/30 px-4 py-3 text-red-400">
            <AlertTriangle size={20} />
            <p>{error}</p>
          </div>
        )}

        {result && statusInfo && (
          <div className="rounded-2xl border border-concert-border bg-concert-card p-6">
            <div className="mb-4 flex items-center gap-3 border-b border-concert-border pb-4">
              <CheckCircle size={28} className={statusInfo.color} />
              <div>
                <p className="text-sm text-gray-500">Trạng thái vé</p>
                <p className={`text-lg font-bold ${statusInfo.color}`}>{statusInfo.label}</p>
              </div>
            </div>

            <h2 className="mb-1 text-xl font-bold text-white">{result.eventName}</h2>
            <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <Calendar size={14} className="text-pink-400" />
                {formatDate(result.eventDate)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={14} className="text-pink-400" />
                {result.eventVenue}
              </span>
            </div>

            <div className="space-y-2 rounded-xl bg-gray-800/50 p-4 text-sm">
              <Row label="Loại vé" value={result.ticketTypeName} />
              <Row label="Số lượng" value={`${result.quantity} vé`} />
              <Row
                label="Khách hàng"
                value={result.customerName}
                icon={<User size={14} className="text-gray-500" />}
              />
              <Row
                label="Email"
                value={result.customerEmail}
                icon={<Mail size={14} className="text-gray-500" />}
              />
              <Row label="Ngày đặt" value={formatDate(result.purchasedAt)} />
              <div className="flex items-center justify-between border-t border-gray-700 pt-2">
                <span className="font-semibold text-white">Tổng tiền</span>
                <span className="font-bold text-green-400">{formatCurrency(result.totalAmount)}</span>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-green-800 bg-green-950/30 p-4">
              <p className="mb-1 text-xs text-green-500">Mã vé</p>
              <p className="break-all font-mono text-sm font-bold text-green-300">
                {result.ticketCode}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-gray-400">
        {icon}
        {label}
      </span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
