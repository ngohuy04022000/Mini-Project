import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Ticket, DollarSign, Lock, RefreshCw, ArrowLeft, TrendingUp, Plus, Check, X } from 'lucide-react';
import { fetchAdminStats, fetchActiveHolds, addTicketSlots } from '../services/api';
import { formatCurrency } from '../utils/format';
import type { AdminStats, ActiveHold } from '../types';

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  sub,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-concert-border bg-concert-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className={`mt-1 text-3xl font-black ${color}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-600">{sub}</p>}
        </div>
        <div className={`rounded-xl p-3 ${color.replace('text-', 'bg-').replace('-400', '-950/50')}`}>
          <Icon size={24} className={color} />
        </div>
      </div>
    </div>
  );
}

function HoldRow({ hold }: { hold: ActiveHold }) {
  const urgency = hold.secondsRemaining < 60 ? 'text-red-400' : hold.secondsRemaining < 120 ? 'text-orange-400' : 'text-green-400';
  const mins = Math.floor(hold.secondsRemaining / 60);
  const secs = hold.secondsRemaining % 60;

  return (
    <tr className="border-t border-concert-border hover:bg-gray-800/30">
      <td className="px-4 py-3 text-sm text-gray-400 font-mono">{hold.sessionId}</td>
      <td className="px-4 py-3 text-sm text-white">{hold.ticketTypeName}</td>
      <td className="px-4 py-3 text-center text-sm font-bold text-white">{hold.quantity}</td>
      <td className={`px-4 py-3 text-center font-mono text-sm font-bold ${urgency}`}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </td>
      <td className="px-4 py-3 text-right text-xs text-gray-600">
        {new Date(hold.createdAt).toLocaleTimeString('vi-VN')}
      </td>
    </tr>
  );
}

function AddSlotsRow({
  ticketTypeId,
  ticketTypeName,
  onSuccess,
}: {
  ticketTypeId: string;
  ticketTypeName: string;
  onSuccess: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpen = () => {
    setOpen(true);
    setError('');
    setValue('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCancel = () => {
    setOpen(false);
    setError('');
  };

  const handleSubmit = async () => {
    const n = parseInt(value, 10);
    if (!n || n < 1 || n > 10_000) {
      setError('Nhập số từ 1 đến 10.000');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await addTicketSlots(ticketTypeId, n);
      setOpen(false);
      onSuccess(result.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 rounded-lg border border-dashed border-gray-600 px-2 py-1 text-xs text-gray-500 transition hover:border-pink-500 hover:text-pink-400"
        title={`Thêm slot cho ${ticketTypeName}`}
      >
        <Plus size={12} />
        Thêm slot
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="number"
        min={1}
        max={10000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') handleCancel();
        }}
        placeholder="Số slot"
        className="w-24 rounded-lg border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white placeholder-gray-600 focus:border-pink-500 focus:outline-none"
        disabled={loading}
      />
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="rounded-lg bg-pink-600 p-1 text-white transition hover:bg-pink-500 disabled:opacity-50"
        title="Xác nhận"
      >
        <Check size={12} />
      </button>
      <button
        onClick={handleCancel}
        disabled={loading}
        className="rounded-lg bg-gray-700 p-1 text-gray-400 transition hover:bg-gray-600"
        title="Hủy"
      >
        <X size={12} />
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState('');

  const statsQuery = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: fetchAdminStats,
    refetchInterval: 5000,
  });

  const holdsQuery = useQuery<ActiveHold[]>({
    queryKey: ['admin-holds'],
    queryFn: fetchActiveHolds,
    refetchInterval: 5000,
  });

  const stats = statsQuery.data;
  const holds = holdsQuery.data ?? [];
  const isLoading = statsQuery.isLoading;

  const handleSlotsAdded = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
    void queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
  };

  return (
    <div className="min-h-screen bg-concert-dark text-white">
      {/* Toast */}
      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-xl border border-green-700 bg-green-950 px-4 py-3 text-sm text-green-300 shadow-xl">
          <Check size={14} className="mr-2 inline" />
          {toast}
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-concert-border bg-concert-dark/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-1 text-sm text-gray-400 hover:text-white">
              <ArrowLeft size={16} />
              Trang chủ
            </a>
            <span className="text-gray-700">|</span>
            <div className="flex items-center gap-2">
              <BarChart3 className="text-pink-500" size={24} />
              <span className="text-xl font-bold">Admin Dashboard</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <RefreshCw size={12} className="animate-spin" />
            Tự động cập nhật mỗi 5 giây
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Stats Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-800" />
            ))}
          </div>
        ) : stats ? (
          <>
            <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Tổng vé đã bán"
                value={stats.totalTicketsSold.toLocaleString('vi-VN')}
                icon={Ticket}
                color="text-green-400"
                sub={`${stats.totalTransactions} giao dịch`}
              />
              <StatCard
                title="Doanh thu"
                value={formatCurrency(stats.totalRevenue)}
                icon={DollarSign}
                color="text-yellow-400"
              />
              <StatCard
                title="Vé đang bị giữ"
                value={stats.activeHolds}
                icon={Lock}
                color="text-orange-400"
                sub="Chờ thanh toán"
              />
              <StatCard
                title="Tỷ lệ bán"
                value={(() => {
                  const total = stats.ticketTypes.reduce((s, t) => s + t.totalQuantity, 0);
                  if (total === 0) return '—';
                  const sold = stats.ticketTypes.reduce((s, t) => s + t.soldQuantity, 0);
                  return `${Math.round((sold / total) * 100)}%`;
                })()}
                icon={TrendingUp}
                color="text-blue-400"
              />
            </div>

            {/* Ticket Type Breakdown */}
            <div className="mb-8 rounded-2xl border border-concert-border bg-concert-card p-6">
              <h2 className="mb-4 text-lg font-bold">Chi Tiết Theo Loại Vé</h2>
              <div className="space-y-5">
                {stats.ticketTypes.map((tt) => {
                  const soldPct = (tt.soldQuantity / tt.totalQuantity) * 100;
                  const holdPct = (tt.holdQuantity / tt.totalQuantity) * 100;
                  const availPct = (tt.availableQuantity / tt.totalQuantity) * 100;
                  return (
                    <div key={tt.id}>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="font-medium text-white">{tt.name}</span>
                            <span className="ml-2 text-gray-500">{formatCurrency(tt.price)}</span>
                          </div>
                          <AddSlotsRow
                            ticketTypeId={tt.id}
                            ticketTypeName={tt.name}
                            onSuccess={handleSlotsAdded}
                          />
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <span className="text-green-400">{tt.soldQuantity} đã bán</span>
                          {' · '}
                          <span className="text-orange-400">{tt.holdQuantity} đang giữ</span>
                          {' · '}
                          <span className="text-blue-400">{tt.availableQuantity} còn lại</span>
                          {' / '}
                          <span>{tt.totalQuantity} tổng</span>
                        </div>
                      </div>
                      <div className="flex h-3 overflow-hidden rounded-full bg-gray-700">
                        <div className="bg-green-500 transition-all" style={{ width: `${soldPct}%` }} />
                        <div className="bg-orange-500 transition-all" style={{ width: `${holdPct}%` }} />
                        <div className="bg-blue-500 transition-all" style={{ width: `${availPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-green-500" />Đã bán</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-orange-500" />Đang giữ</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-blue-500" />Còn lại</span>
              </div>
            </div>
          </>
        ) : null}

        {/* Active Holds Table */}
        <div className="rounded-2xl border border-concert-border bg-concert-card">
          <div className="flex items-center justify-between p-6 pb-4">
            <h2 className="text-lg font-bold">
              Vé Đang Bị Khóa Tạm Thời{' '}
              <span className="ml-2 rounded-full bg-orange-950/50 px-2 py-0.5 text-sm text-orange-400">
                {holds.length}
              </span>
            </h2>
          </div>

          {holds.length === 0 ? (
            <div className="px-6 pb-6 text-center text-gray-500">
              <Lock size={32} className="mx-auto mb-2 opacity-30" />
              <p>Không có vé nào đang bị giữ</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-t border-concert-border bg-gray-900/50">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Session</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Loại vé</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">SL</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Còn lại</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Thời gian giữ</th>
                  </tr>
                </thead>
                <tbody>
                  {holds.map((hold) => (
                    <HoldRow key={hold.id} hold={hold} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
