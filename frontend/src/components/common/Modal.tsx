import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
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
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-secondary-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-3 sm:p-4">
        <div
          className={`relative w-full max-w-full ${sizeClasses[size]} bg-white rounded-2xl shadow-2xl transform transition-all gold-border my-4 max-h-[calc(100vh-2rem)] flex flex-col`}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          {title && (
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-secondary-100 flex-shrink-0 gap-2">
              <h3 className="text-base sm:text-lg font-semibold text-secondary-900 truncate">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-secondary-50 transition-colors border border-transparent hover:border-secondary-200 flex-shrink-0"
                aria-label="閉じる"
              >
                <X className="w-5 h-5 text-secondary-400" />
              </button>
            </div>
          )}

          {/* Content */}
          <div className="px-4 sm:px-6 py-4 overflow-y-auto flex-1 overscroll-contain">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
