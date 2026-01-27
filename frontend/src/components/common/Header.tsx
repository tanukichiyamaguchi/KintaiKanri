import { Menu, LogOut, User, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  title?: string;
  showMenu?: boolean;
  onMenuClick?: () => void;
}

export function Header({ title = 'KATEstageLASH', showMenu = false, onMenuClick }: HeaderProps) {
  const { staff, isAdmin, logout } = useAuth();

  return (
    <header className="header-elegant sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            {showMenu && (
              <button
                onClick={onMenuClick}
                className="p-2 rounded-xl hover:bg-primary-50 transition-colors border border-transparent hover:border-primary-200"
                aria-label="メニューを開く"
              >
                <Menu className="w-5 h-5 text-secondary-600" />
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm shadow-primary-500/20">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-lg font-bold logo-text tracking-wide">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {(staff || isAdmin) && (
              <>
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm">
                    <User className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-sm font-medium text-secondary-700">
                    {isAdmin ? '管理者' : `${staff?.name}さん`}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-2.5 rounded-xl hover:bg-red-50 transition-colors text-secondary-400 hover:text-red-500 border border-transparent hover:border-red-200"
                  aria-label="ログアウト"
                >
                  <LogOut className="w-4.5 h-4.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Gold accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary-400 to-transparent" />
    </header>
  );
}
