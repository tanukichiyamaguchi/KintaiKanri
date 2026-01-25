import { Menu, LogOut, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  title?: string;
  showMenu?: boolean;
  onMenuClick?: () => void;
}

export function Header({ title = 'KATEstageLASH', showMenu = false, onMenuClick }: HeaderProps) {
  const { staff, isAdmin, logout } = useAuth();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            {showMenu && (
              <button
                onClick={onMenuClick}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="メニューを開く"
              >
                <Menu className="w-6 h-6 text-gray-600" />
              </button>
            )}
            <h1 className="text-xl font-bold text-primary-700">{title}</h1>
          </div>

          <div className="flex items-center gap-4">
            {(staff || isAdmin) && (
              <>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="w-4 h-4" />
                  <span>{isAdmin ? '管理者' : `${staff?.name}さん`}</span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
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
