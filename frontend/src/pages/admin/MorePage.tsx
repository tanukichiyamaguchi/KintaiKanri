import { Link } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Header } from '../../components/common';
import { ADMIN_MORE_SECTIONS } from '../../components/layout/navigation';
import { useDashboardSummary, pendingCounts } from '../../api/dashboardStore';

/**
 * 管理者の「その他」タブ（iPhone の下部タブに入りきらない項目をまとめる）。
 * PC・iPad では左側のメニューにすべて並ぶため、主に iPhone から使う。
 */
export function MorePage() {
  const { admin, logout } = useAuth();
  const { data } = useDashboardSummary();
  const counts = pendingCounts(data);

  return (
    <div className="page">
      <Header title="その他" />
      <main className="page-content">
        {ADMIN_MORE_SECTIONS.map(section => (
          <section key={section.title} className="section">
            {section.title && <h2 className="section-header">{section.title}</h2>}
            <div className="list-group">
              {section.items.map(item => {
                const Icon = item.icon;
                const count = item.badge && item.badge !== 'more' ? counts[item.badge] : 0;
                return (
                  <Link key={item.to} to={item.to} className="list-row list-row-with-icon">
                    <span className={`row-icon ${item.iconBg}`}>
                      <Icon aria-hidden="true" />
                    </span>
                    <span className="list-row-title t-body">{item.label}</span>
                    {count > 0 && <span className="count-badge">{count}</span>}
                    <ChevronRight className="list-chevron !w-4 !h-4" strokeWidth={2.5} aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        <section className="section">
          <h2 className="section-header">アカウント</h2>
          <div className="list-group">
            <div className="list-row">
              <span className="list-row-title t-body">{admin?.name || '管理者'}</span>
              <span className="t-subhead text-label-2 truncate max-w-[55%]">{admin?.email}</span>
            </div>
            <button type="button" onClick={logout} className="list-row justify-center text-danger">
              <LogOut className="h-5 w-5" aria-hidden="true" />
              <span className="t-body">ログアウト</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
