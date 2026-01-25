import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, AlertCircle, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { staffApi } from '../api';
import type { StaffInfo } from '../types';
import { PinInput, Loading } from '../components/common';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loginAsAdmin, isAuthenticated, isAdmin } = useAuth();

  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffInfo | null>(null);
  const [pinCode, setPinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingStaff, setIsFetchingStaff] = useState(true);
  const [error, setError] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate(isAdmin ? '/admin' : '/clock');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Fetch staff list
  useEffect(() => {
    async function fetchStaff() {
      try {
        const response = await staffApi.getList();
        if (response.success && response.data) {
          setStaffList(response.data.filter(s => s.status === 'active'));
        }
      } catch {
        setError('スタッフ情報の取得に失敗しました');
      } finally {
        setIsFetchingStaff(false);
      }
    }
    fetchStaff();
  }, []);

  const handleStaffSelect = (staff: StaffInfo) => {
    setSelectedStaff(staff);
    setShowDropdown(false);
    setPinCode('');
    setError('');
  };

  const handlePinComplete = async (pin: string) => {
    if (!selectedStaff) return;

    setIsLoading(true);
    setError('');

    const result = await login(selectedStaff.staffId, pin);

    if (result.success) {
      navigate('/clock');
    } else {
      setError(result.error || 'ログインに失敗しました');
      setPinCode('');
    }

    setIsLoading(false);
  };

  const handleAdminLogin = () => {
    loginAsAdmin();
    navigate('/admin');
  };

  if (isFetchingStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100">
        <Loading message="読み込み中..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-700 mb-2">KATEstageLASH</h1>
          <p className="text-gray-600">勤怠管理システム</p>
        </div>

        {/* Login Card */}
        <div className="card">
          <h2 className="text-xl font-semibold text-center text-gray-800 mb-6">
            スタッフログイン
          </h2>

          {/* Staff Selection */}
          <div className="mb-6">
            <label className="label">スタッフを選択</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className={`input text-left flex items-center justify-between ${
                  error && !selectedStaff ? 'input-error' : ''
                }`}
              >
                <span className={selectedStaff ? 'text-gray-900' : 'text-gray-400'}>
                  {selectedStaff?.name || 'スタッフを選択してください'}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    showDropdown ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {showDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {staffList.length === 0 ? (
                    <div className="px-4 py-3 text-gray-500 text-sm">
                      登録されたスタッフがいません
                    </div>
                  ) : (
                    staffList.map(staff => (
                      <button
                        key={staff.staffId}
                        type="button"
                        onClick={() => handleStaffSelect(staff)}
                        className={`w-full px-4 py-3 text-left hover:bg-primary-50 transition-colors ${
                          selectedStaff?.staffId === staff.staffId
                            ? 'bg-primary-100 text-primary-700'
                            : 'text-gray-700'
                        }`}
                      >
                        {staff.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* PIN Input */}
          {selectedStaff && (
            <div className="mb-6">
              <label className="label text-center">PINコード（4桁）</label>
              <div className="mt-3">
                <PinInput
                  value={pinCode}
                  onChange={setPinCode}
                  onComplete={handlePinComplete}
                  disabled={isLoading}
                  error={!!error}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center mb-4">
              <Loading size="sm" message="ログイン中..." />
            </div>
          )}

          {/* Login Button */}
          <button
            type="button"
            onClick={() => pinCode.length === 4 && handlePinComplete(pinCode)}
            disabled={!selectedStaff || pinCode.length !== 4 || isLoading}
            className="btn btn-primary w-full btn-large"
          >
            ログイン
          </button>
        </div>

        {/* Admin Login Link */}
        <div className="mt-6 text-center">
          <button
            onClick={handleAdminLogin}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary-600 transition-colors"
          >
            <Shield className="w-4 h-4" />
            管理者としてログイン
          </button>
        </div>
      </div>
    </div>
  );
}
