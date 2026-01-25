import { useState, useEffect } from 'react';
import { formatDateJapanese } from '../../utils/calculations';

interface ClockProps {
  showDate?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function Clock({ showDate = true, size = 'lg' }: ClockProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const sizeClasses = {
    sm: {
      time: 'text-2xl',
      date: 'text-sm',
    },
    md: {
      time: 'text-4xl',
      date: 'text-base',
    },
    lg: {
      time: 'text-6xl',
      date: 'text-lg',
    },
  };

  const todayStr = time.toISOString().split('T')[0];

  return (
    <div className="text-center">
      <div className={`font-mono font-bold text-gray-800 ${sizeClasses[size].time}`}>
        {formatTime(time)}
      </div>
      {showDate && (
        <div className={`text-gray-600 mt-2 ${sizeClasses[size].date}`}>
          {formatDateJapanese(todayStr)}
        </div>
      )}
    </div>
  );
}
