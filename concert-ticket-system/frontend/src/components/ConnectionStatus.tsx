import { Wifi, WifiOff } from 'lucide-react';
import { useSocket } from '../contexts/SocketContext';

export function ConnectionStatus() {
  const { isConnected } = useSocket();

  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
        isConnected
          ? 'bg-green-950/50 text-green-400'
          : 'bg-red-950/50 text-red-400'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
      {isConnected ? (
        <>
          <Wifi size={12} />
          Live
        </>
      ) : (
        <>
          <WifiOff size={12} />
          Mất kết nối
        </>
      )}
    </div>
  );
}
