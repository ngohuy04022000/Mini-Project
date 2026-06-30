import { AlertTriangle, Clock } from 'lucide-react';
import { useCountdown } from '../hooks/useCountdown';

interface CountdownTimerProps {
  expiresInSeconds: number;
  onExpire: () => void;
}

export function CountdownTimer({ expiresInSeconds, onExpire }: CountdownTimerProps) {
  const { minutes, seconds, secondsRemaining, isExpired } = useCountdown(expiresInSeconds, onExpire);

  const isUrgent = secondsRemaining <= 60;
  const isCritical = secondsRemaining <= 30;

  if (isExpired) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-red-950/50 px-4 py-3 text-red-400">
        <AlertTriangle size={20} />
        <span className="font-semibold">Thời gian giữ vé đã hết!</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
        isCritical
          ? 'animate-pulse bg-red-950/70 text-red-400'
          : isUrgent
          ? 'bg-orange-950/50 text-orange-400'
          : 'bg-gray-800 text-gray-300'
      }`}
    >
      <Clock size={20} className={isCritical ? 'animate-ping' : ''} />
      <div>
        <p className="text-xs opacity-70">Thời gian còn lại để thanh toán</p>
        <p className={`font-mono text-2xl font-bold tracking-widest ${isCritical ? 'animate-countdown-tick' : ''}`}>
          {minutes}:{seconds}
        </p>
      </div>
      {isUrgent && (
        <div className="ml-auto">
          <AlertTriangle size={20} />
        </div>
      )}
    </div>
  );
}
