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
    <header className="header-gradient sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            {showMenu && (
              <button
                onClick={onMenuClick}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="メニューを開く"
              >
                <Menu className="w-6 h-6 text-white/80" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary-400" />
              <h1 className="text-xl font-bold gold-text">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {(staff || isAdmin) && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-white/90 font-medium">
                    {isAdmin ? '管理者' : `${staff?.name}さん`}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                  aria-label="ログアウト"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
