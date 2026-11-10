import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface HeaderProps {
  /** ページのタイトル（大きいタイトルと、スクロール後のナビバーに表示） */
  title: string;
  /** 大きいタイトルの下に添える補足（日付・対象者など） */
  subtitle?: ReactNode;
  /** 指定すると、ナビバー左に「戻る」を表示する */
  backTo?: string;
  backLabel?: string;
  /** 「戻る」を iPhone など幅の狭い画面でだけ表示する（PC・iPad は左側メニューから移動できるため） */
  backMobileOnly?: boolean;
  /** ナビバー右側に置く操作 */
  actions?: ReactNode;
  /** 大きいタイトルを出さず、ナビバーに小さいタイトルだけを出す */
  compact?: boolean;
  /** 本文の最大幅を広げる（表の多い管理画面用） */
  wide?: boolean;
}

/**
 * iOS 風のナビゲーションバー + 大きいタイトル。
 * 大きいタイトルが見えている間はバーを透明にし、スクロールして隠れると
 * すりガラスのバーに小さいタイトルを表示する（iOS の標準的な動き）。
 */
export function Header({ title, subtitle, backTo, backLabel = '戻る', backMobileOnly = false, actions, compact = false, wide = false }: HeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const largeTitleRef = useRef<HTMLDivElement>(null);
  const [scrolledPastTitle, setScrolledPastTitle] = useState(false);
  const collapsed = compact || scrolledPastTitle;

  useEffect(() => {
    if (compact) return;
    const el = largeTitleRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // ナビバー（44px + 上の安全領域）の下に大きいタイトルが隠れたら「スクロール済み」。
    // ホーム画面から全画面で開くと安全領域の分だけバーが高くなるので、実際の高さを使う。
    const barHeight = Math.round(headerRef.current?.getBoundingClientRect().height || 44);
    const observer = new IntersectionObserver(
      ([entry]) => setScrolledPastTitle(!entry.isIntersecting),
      { rootMargin: `-${barHeight}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact]);

  const maxWidth = wide ? 'max-w-[1120px]' : 'max-w-[720px]';

  return (
    <>
      <header
        ref={headerRef}
        className={`sticky top-0 z-30 transition-[background-color,box-shadow] duration-200 ${
          collapsed ? 'material-bar hairline-bottom' : 'bg-canvas'
        }`}
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className={`relative mx-auto flex h-11 items-center px-2 ${maxWidth}`}>
          <div className="z-10 flex min-w-0 flex-1 items-center">
            {backTo && (
              <Link
                to={backTo}
                className={`-ml-1 flex min-h-11 items-center gap-0.5 pr-2 text-tint active:opacity-60 ${backMobileOnly ? 'lg:hidden' : ''}`}
                aria-label={`${backLabel}へ戻る`}
              >
                <ChevronLeft className="h-7 w-7" strokeWidth={2.2} aria-hidden="true" />
                <span className="t-body max-w-[9em] truncate">{backLabel}</span>
              </Link>
            )}
          </div>
          {compact ? (
            <h1 className="pointer-events-none absolute inset-x-24 text-center t-headline truncate">{title}</h1>
          ) : (
            <p
              className={`pointer-events-none absolute inset-x-24 text-center t-headline truncate transition-opacity duration-200 ${
                collapsed ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden="true"
            >
              {title}
            </p>
          )}
          <div className="z-10 flex flex-1 items-center justify-end gap-1">{actions}</div>
        </div>
      </header>
      {!compact && (
        <div ref={largeTitleRef} className={`mx-auto px-4 pb-2 pt-0.5 ${maxWidth}`}>
          <h1 className="t-large-title">{title}</h1>
          {subtitle && <div className="mt-0.5 t-subhead text-label-2">{subtitle}</div>}
        </div>
      )}
    </>
  );
}
