import { useState, useEffect, useCallback, useRef } from 'react';

interface CountdownResult {
  secondsRemaining: number;
  isExpired: boolean;
  minutes: string;
  seconds: string;
  reset: (newSeconds: number) => void;
}

export function useCountdown(initialSeconds: number, onExpire?: () => void): CountdownResult {
  const [secondsRemaining, setSecondsRemaining] = useState(Math.max(0, initialSeconds));
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const reset = useCallback((newSeconds: number) => {
    setSecondsRemaining(Math.max(0, newSeconds));
  }, []);

  useEffect(() => {
    if (secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(interval);
          onExpireRef.current?.();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining > 0]);

  const isExpired = secondsRemaining <= 0;
  const minutes = String(Math.floor(secondsRemaining / 60)).padStart(2, '0');
  const seconds = String(secondsRemaining % 60).padStart(2, '0');

  return { secondsRemaining, isExpired, minutes, seconds, reset };
}
