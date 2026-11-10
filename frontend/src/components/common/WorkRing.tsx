import { useId, type ReactNode } from 'react';
import { DAILY_STANDARD_MINUTES } from '../../utils/breakCalculator';
import { formatDuration } from '../../utils/workTime';

/**
 * 今日の実働時間を、所定労働時間（8 時間）に向かって伸びる金色のリングで表す。
 * iPhone のアクティビティリングのように、ひと目で「今日どれだけ働いたか」が分かる。
 * リングが一周 = 実働 8 時間（ここから先は残業）。実働の算出は utils/workTime.ts。
 */

interface WorkRingProps {
  workedMinutes: number;
  active: boolean;
  size?: number;
  children?: ReactNode;
}

export function WorkRing({ workedMinutes, active, size = 248, children }: WorkRingProps) {
  const gradientId = useId();
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = Math.min(workedMinutes / DAILY_STANDARD_MINUTES, 1);
  const overtime = Math.max(0, workedMinutes - DAILY_STANDARD_MINUTES);

  return (
    <div
      className="relative mx-auto"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`今日の実働 ${formatDuration(workedMinutes)}（8時間で一周）`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0d27a" />
            <stop offset="55%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#a8820c" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ios-fill)" strokeWidth={stroke} />
        {progress > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.32, 0.72, 0, 1)', opacity: active ? 1 : 0.85 }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
        {overtime > 0 && <p className="mt-1 t-caption font-semibold text-tint tabular">残業 {formatDuration(overtime)}</p>}
      </div>
    </div>
  );
}
