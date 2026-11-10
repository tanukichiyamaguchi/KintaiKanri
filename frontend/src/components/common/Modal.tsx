import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * iOS 風のシート。
 * - iPhone など幅の狭い画面: 画面下からせり上がるシート（上部に取っ手）
 * - 幅の広い画面: 画面中央のダイアログ
 * 背景のタップ・Esc キー・右上の × で閉じる。
 */
export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      {/* 背景 */}
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} aria-hidden="true" />

      {/* シート本体 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`relative flex w-full ${sizeClasses[size]} max-h-[92dvh] flex-col bg-elevated rounded-t-[14px] sm:rounded-[14px] animate-slide-up sm:animate-scale-in`}
        style={{ boxShadow: 'var(--ios-shadow-sheet)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 取っ手（iPhone のみ） */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="h-[5px] w-9 rounded-full bg-label-4" />
        </div>

        <div className="relative flex min-h-[48px] flex-shrink-0 items-center justify-center px-14">
          {title && (
            <h2 id={titleId} className="t-headline truncate text-center">
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-1/2 grid h-[30px] w-[30px] -translate-y-1/2 place-items-center rounded-full bg-fill text-label-2 active:opacity-60"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(20px+var(--safe-bottom))] pt-1 sm:px-5 sm:pb-5">
          {children}
        </div>
      </div>
    </div>
  );
}
