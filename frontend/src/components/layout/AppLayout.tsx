import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { refreshDashboard, useDashboardSummary, pendingCounts } from '../../api/dashboardStore';
import {
  STAFF_TABS,
  STAFF_SIDEBAR,
  ADMIN_TABS,
  ADMIN_SIDEBAR,
  isActive,
  type BadgeKey,
  type NavItem,
  type NavSection,
} from './navigation';

/**
 * ログイン後の画面の枠組み。
 * - iPhone など幅の狭い画面: 画面下部のタブバー
 * - iPad・PC など幅の広い画面（1024px 以上）: 左側のメニュー（サイドバー）
 * 各ページの中身は <Outlet />（ページ側でナビバーと大きいタイトルを出す）。
 */
export function AppLayout() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const { data } = useDashboardSummary();

  // 管理者: 承認待ちの件数バッジのため、まとめ取得を定期的に更新する
  // （ダッシュボード画面と同じデータを共有するので、余分な往復は増えない）
  useEffect(() => {
    if (!isAdmin) return;
    refreshDashboard();
    const id = window.setInterval(() => refreshDashboard(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshDashboard();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAdmin]);

  const counts = pendingCounts(isAdmin ? data : undefined);
  const badgeOf = (key?: BadgeKey): number => {
    if (!key) return 0;
    if (key === 'more') return counts.shiftRequests + counts.paidLeave;
    return counts[key];
  };

  const tabs = isAdmin ? ADMIN_TABS : STAFF_TABS;
  const sections = isAdmin ? ADMIN_SIDEBAR : STAFF_SIDEBAR;

  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      <Sidebar sections={sections} pathname={location.pathname} badgeOf={badgeOf} />
      <div className="min-w-0 flex-1 pb-[calc(var(--tabbar-height)+var(--safe-bottom)+8px)] lg:pb-0">
        <Outlet />
      </div>
      <TabBar items={tabs} pathname={location.pathname} badgeOf={badgeOf} />
    </div>
  );
}

function TabBar({ items, pathname, badgeOf }: { items: NavItem[]; pathname: string; badgeOf: (k?: BadgeKey) => number }) {
  return (
    <nav
      aria-label="メインメニュー"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 material-bar hairline-top"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="flex h-[var(--tabbar-height)] max-w-[720px] mx-auto">
        {items.map(item => {
          const active = isActive(item, pathname);
          const count = badgeOf(item.badge);
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                aria-current={active ? 'page' : undefined}
                aria-label={count > 0 ? `${item.label}（未対応 ${count}件）` : undefined}
                className={`relative flex h-full flex-col items-center justify-center gap-[3px] pt-1 transition-colors ${
                  active ? 'text-tint' : 'text-label-2'
                }`}
              >
                <span className="relative">
                  <Icon className="w-[25px] h-[25px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                  {count > 0 && (
                    <span className="count-badge absolute -top-1.5 left-[15px]" aria-hidden="true">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium leading-none tracking-wide">{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Sidebar({ sections, pathname, badgeOf }: { sections: NavSection[]; pathname: string; badgeOf: (k?: BadgeKey) => number }) {
  const { staff, admin, isAdmin, logout } = useAuth();
  const name = isAdmin ? admin?.name || '管理者' : staff?.name || '';
  return (
    <aside
      aria-label="メインメニュー"
      className="hidden lg:flex sticky top-0 z-30 h-dvh w-[280px] flex-shrink-0 flex-col bg-canvas"
      style={{ boxShadow: 'inset -0.5px 0 0 var(--ios-separator)' }}
    >
      <div className="px-5 pt-6 pb-4 flex items-center gap-3">
        {/* 反転（ダーク表示）がロゴだけにかかるよう、背景の角丸は外側の要素に付ける */}
        <span className="grid h-11 w-11 flex-shrink-0 place-items-center overflow-hidden rounded-[10px] bg-surface">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="logo-adaptive h-11 w-11 object-contain" />
        </span>
        <div className="min-w-0">
          <p className="t-headline truncate">KATE stage LASH</p>
          <p className="t-footnote text-label-2 truncate">勤怠管理</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section, i) => (
          <div key={i} className={i > 0 ? 'mt-5' : 'mt-1'}>
            {section.title && <p className="px-3 pb-1.5 t-footnote font-semibold text-label-2">{section.title}</p>}
            <ul className="space-y-0.5">
              {section.items.map(item => {
                const active = isActive(item, pathname);
                const count = badgeOf(item.badge);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      aria-current={active ? 'page' : undefined}
                      aria-label={count > 0 ? `${item.label}（未対応 ${count}件）` : undefined}
                      className={`flex items-center gap-3 rounded-[10px] px-3 py-2 transition-colors ${
                        active ? 'bg-tint-solid text-on-tint' : 'text-label hover:bg-fill'
                      }`}
                    >
                      <span className={`row-icon !w-[26px] !h-[26px] !rounded-[6px] ${item.iconBg}`}>
                        <Icon className="!w-4 !h-4" aria-hidden="true" />
                      </span>
                      <span className="flex-1 t-body truncate">{item.label}</span>
                      {count > 0 && (
                        <span className={`t-subhead tabular font-medium ${active ? 'text-on-tint' : 'text-label-2'}`} aria-hidden="true">{count}</span>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-[calc(16px+var(--safe-bottom))] pt-3 hairline-top">
        <div className="px-3 pb-2">
          <p className="t-subhead font-semibold truncate">{name}</p>
          <p className="t-footnote text-label-2">{isAdmin ? '管理者' : 'スタッフ'}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-3 rounded-[10px] px-3 py-2 text-danger hover:bg-fill transition-colors"
        >
          <LogOut className="w-5 h-5" aria-hidden="true" />
          <span className="t-body">ログアウト</span>
        </button>
      </div>
    </aside>
  );
}
