import React from 'react';
import { Wifi, WifiOff, Users } from 'lucide-react';

interface ConnectionStatusProps {
  isConnected: boolean;
  userCount: number;
  status: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  userCount,
  status,
}) => {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        isConnected
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
      }`}
      title={status}
    >
      {isConnected ? (
        <>
          <Wifi className="w-4 h-4 animate-pulse" />
          <span>Connected</span>
          <span className="ml-2 px-2 py-0.5 bg-white/30 rounded text-xs font-semibold flex items-center gap-1">
            <Users className="w-3 h-3" />
            {userCount}
          </span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4" />
          <span>Disconnected</span>
        </>
      )}
    </div>
  );
};
