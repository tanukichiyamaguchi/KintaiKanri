import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, AlertCircle, Shield, Sparkles, Check } from 'lucide-react';
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-secondary-900 via-secondary-800 to-secondary-950">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center animate-pulse">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <Loading message="読み込み中..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-secondary-900 via-secondary-800 to-secondary-950 p-4 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/30 transform hover:scale-105 transition-transform">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold gold-text mb-2 tracking-wide">KATEstageLASH</h1>
          <p className="text-secondary-400 text-sm tracking-wider">ATTENDANCE MANAGEMENT SYSTEM</p>
        </div>

        {/* Login Card */}
        <div className="card card-dark gold-border">
          <h2 className="text-lg font-semibold text-center text-white mb-6 flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
            スタッフログイン
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
          </h2>

          {/* Staff Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-secondary-300 mb-2">
              スタッフを選択
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className={`w-full px-4 py-3.5 text-left flex items-center justify-between rounded-xl border-2 transition-all ${
                  error && !selectedStaff
                    ? 'border-red-500 bg-red-500/10'
                    : selectedStaff
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-secondary-600 bg-secondary-800 hover:border-secondary-500'
                }`}
              >
                <span className={selectedStaff ? 'text-white' : 'text-secondary-400'}>
                  {selectedStaff?.name || 'スタッフを選択してください'}
                </span>
                <ChevronDown
                  className={`w-5 h-5 transition-transform ${
                    showDropdown ? 'rotate-180' : ''
                  } ${selectedStaff ? 'text-primary-400' : 'text-secondary-400'}`}
                />
              </button>

              {showDropdown && (
                <div className="absolute z-10 w-full mt-2 bg-secondary-800 border border-secondary-600 rounded-xl shadow-xl max-h-60 overflow-auto">
                  {staffList.length === 0 ? (
                    <div className="px-4 py-3 text-secondary-400 text-sm">
                      登録されたスタッフがいません
                    </div>
                  ) : (
                    staffList.map(staff => (
                      <button
                        key={staff.staffId}
                        type="button"
                        onClick={() => handleStaffSelect(staff)}
                        className={`w-full px-4 py-3 text-left hover:bg-primary-500/20 transition-colors flex items-center justify-between ${
                          selectedStaff?.staffId === staff.staffId
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'text-secondary-200'
                        }`}
                      >
                        <span>{staff.name}</span>
                        {selectedStaff?.staffId === staff.staffId && (
                          <Check className="w-4 h-4 text-primary-400" />
                        )}
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
              <label className="block text-sm font-medium text-secondary-300 mb-3 text-center">
                PINコード（4桁）
              </label>
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
            <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/30 px-4 py-3 rounded-xl mb-4">
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
        <div className="mt-8 text-center">
          <button
            onClick={handleAdminLogin}
            className="inline-flex items-center gap-2 text-sm text-secondary-500 hover:text-primary-400 transition-colors group"
          >
            <Shield className="w-4 h-4 group-hover:text-primary-400 transition-colors" />
            管理者としてログイン
          </button>
        </div>

        {/* Demo Mode Notice */}
        <div className="mt-6 text-center">
          <p className="text-xs text-secondary-600">
            デモモード: 任意の4桁PINでログイン可能
          </p>
        </div>
      </div>
    </div>
  );
}
