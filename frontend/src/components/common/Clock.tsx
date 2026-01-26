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
      time: 'text-3xl',
      date: 'text-sm',
    },
    md: {
      time: 'text-5xl',
      date: 'text-base',
    },
    lg: {
      time: 'text-7xl',
      date: 'text-lg',
    },
  };

  const todayStr = time.toISOString().split('T')[0];

  return (
    <div className="text-center py-4">
      <div className={`clock-display font-bold tracking-wider ${sizeClasses[size].time}`}>
        {formatTime(time)}
      </div>
      {showDate && (
        <div className={`text-secondary-500 mt-3 font-medium ${sizeClasses[size].date}`}>
          {formatDateJapanese(todayStr)}
        </div>
      )}
    </div>
  );
}
