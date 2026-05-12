import { Menu, LogOut, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  title?: string;
  showMenu?: boolean;
  onMenuClick?: () => void;
}

export function Header({ title, showMenu = false, onMenuClick }: HeaderProps) {
  const { staff, isAdmin, logout } = useAuth();

  return (
    <header className="header-elegant sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-shrink">
            {showMenu && (
              <button
                onClick={onMenuClick}
                className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-primary-50 transition-colors border border-transparent hover:border-primary-200 flex-shrink-0"
                aria-label="メニューを開く"
              >
                <Menu className="w-5 h-5 text-secondary-600" />
              </button>
            )}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="KATEstageLASH"
                className="h-10 sm:h-12 w-auto object-contain flex-shrink-0"
              />
              {title && (
                <h1 className="text-base sm:text-lg font-bold text-secondary-700 truncate">
                  {title}
                </h1>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            {(staff || isAdmin) && (
              <>
                <div className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100 max-w-[140px] sm:max-w-[200px]">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-sm flex-shrink-0">
                    <User className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-secondary-700 truncate whitespace-nowrap">
                    {isAdmin ? '管理者' : `${staff?.name}さん`}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-red-50 transition-colors text-secondary-400 hover:text-red-500 border border-transparent hover:border-red-200 flex-shrink-0"
                  aria-label="ログアウト"
                >
                  <LogOut className="w-5 h-5" />
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
