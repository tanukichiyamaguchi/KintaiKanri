interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  fullScreen?: boolean;
}

/** iOS 風の読み込み中インジケーター（放射状の 8 本線が回転する）。 */
export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`text-label-2 ${className}`}
      style={{ animation: 'spin 0.9s steps(8) infinite' }}
      aria-hidden="true"
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <line
          key={i}
          x1="12"
          y1="3"
          x2="12"
          y2="7.5"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity={0.2 + (i / 8) * 0.8}
          transform={`rotate(${i * 45} 12 12)`}
        />
      ))}
    </svg>
  );
}

export function Loading({ size = 'md', message, fullScreen = false }: LoadingProps) {
  const px = { sm: 18, md: 26, lg: 34 }[size];

  const content = (
    <div className="flex flex-col items-center justify-center gap-3 py-2" role="status" aria-live="polite">
      <Spinner size={px} />
      {message ? <p className="t-subhead text-label-2">{message}</p> : <span className="sr-only">読み込み中</span>}
    </div>
  );

  if (fullScreen) {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas">{content}</div>;
  }

  return content;
}
