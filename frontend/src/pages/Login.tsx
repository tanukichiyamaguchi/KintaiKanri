import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, AlertCircle, Shield, Check, Lock, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { staffApi } from '../api';
import type { StaffInfo } from '../types';
import { PinInput, Loading, Modal } from '../components/common';

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

  // Admin login modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminError, setAdminError] = useState('');
  const [isAdminLoading, setIsAdminLoading] = useState(false);

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

  const handleOpenAdminModal = () => {
    setShowAdminModal(true);
    setAdminPin('');
    setAdminError('');
  };

  const handleCloseAdminModal = () => {
    setShowAdminModal(false);
    setAdminPin('');
    setAdminError('');
  };

  const handleAdminPinComplete = async (pin: string) => {
    setIsAdminLoading(true);
    setAdminError('');

    const result = await loginAsAdmin(pin);

    if (result.success) {
      navigate('/admin');
    } else {
      setAdminError(result.error || '管理者PINが正しくありません');
      setAdminPin('');
    }

    setIsAdminLoading(false);
  };

  if (isFetchingStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-primary-50 to-white">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25 glow">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <Loading message="読み込み中..." />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white via-primary-50/30 to-white p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-gradient-to-br from-primary-200/20 to-transparent rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-tl from-primary-200/20 to-transparent rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-primary-100/10 to-transparent rounded-full" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 flex items-center justify-center shadow-xl shadow-primary-500/30 transform hover:scale-105 transition-transform gold-shine">
            <Sparkles className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold logo-text mb-3 tracking-wider">KATEstageLASH</h1>
          <div className="divider-elegant w-32 mx-auto mb-3" />
          <p className="text-secondary-500 text-sm tracking-[0.2em] uppercase">Attendance Management</p>
        </div>

        {/* Login Card */}
        <div className="card card-gold gold-border">
          <h2 className="text-lg font-semibold text-center text-secondary-800 mb-8 flex items-center justify-center gap-3">
            <span className="w-8 h-px bg-gradient-to-r from-transparent to-primary-400" />
            <span>スタッフログイン</span>
            <span className="w-8 h-px bg-gradient-to-l from-transparent to-primary-400" />
          </h2>

          {/* Staff Selection */}
          <div className="mb-6">
            <label className="label">
              スタッフを選択
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className={`w-full px-5 py-4 text-left flex items-center justify-between rounded-xl border-2 transition-all bg-white ${
                  error && !selectedStaff
                    ? 'border-red-400 bg-red-50/50'
                    : selectedStaff
                    ? 'border-primary-400 shadow-sm shadow-primary-500/10'
                    : 'border-secondary-200 hover:border-primary-300'
                }`}
              >
                <span className={selectedStaff ? 'text-secondary-800 font-medium' : 'text-secondary-400'}>
                  {selectedStaff?.name || 'スタッフを選択してください'}
                </span>
                <ChevronDown
                  className={`w-5 h-5 transition-transform duration-300 ${
                    showDropdown ? 'rotate-180' : ''
                  } ${selectedStaff ? 'text-primary-500' : 'text-secondary-400'}`}
                />
              </button>

              {showDropdown && (
                <div className="absolute z-10 w-full mt-2 bg-white border border-secondary-200 rounded-xl shadow-xl max-h-60 overflow-auto">
                  {staffList.length === 0 ? (
                    <div className="px-5 py-4 text-secondary-400 text-sm text-center">
                      登録されたスタッフがいません
                    </div>
                  ) : (
                    staffList.map(staff => (
                      <button
                        key={staff.staffId}
                        type="button"
                        onClick={() => handleStaffSelect(staff)}
                        className={`w-full px-5 py-4 text-left hover:bg-primary-50 transition-colors flex items-center justify-between ${
                          selectedStaff?.staffId === staff.staffId
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-secondary-700'
                        }`}
                      >
                        <span className="font-medium">{staff.name}</span>
                        {selectedStaff?.staffId === staff.staffId && (
                          <Check className="w-5 h-5 text-primary-500" />
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
              <label className="label text-center block">
                PINコード（4桁）
              </label>
              <div className="mt-4">
                <PinInput
                  value={pinCode}
                  onChange={setPinCode}
                  onComplete={handlePinComplete}
                  disabled={isLoading}
                  error={!!error}
                  darkMode={false}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 px-4 py-3.5 rounded-xl mb-5">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center mb-5">
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
        <div className="mt-10 text-center">
          <button
            onClick={handleOpenAdminModal}
            className="inline-flex items-center gap-2.5 text-sm text-secondary-500 hover:text-primary-600 transition-colors group"
          >
            <Shield className="w-4 h-4 group-hover:text-primary-500 transition-colors" />
            <span className="border-b border-transparent group-hover:border-primary-400 transition-colors">管理者としてログイン</span>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-secondary-400 tracking-wider">
            &copy; 2025 KATEstageLASH. All rights reserved.
          </p>
        </div>
      </div>

      {/* Admin Login Modal */}
      <Modal
        isOpen={showAdminModal}
        onClose={handleCloseAdminModal}
        title="管理者ログイン"
        size="sm"
      >
        <div className="py-6">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/25">
            <Lock className="w-10 h-10 text-white" />
          </div>

          <p className="text-center text-secondary-600 mb-8">
            管理者PINコードを入力してください
          </p>

          <div className="mb-6">
            <PinInput
              value={adminPin}
              onChange={setAdminPin}
              onComplete={handleAdminPinComplete}
              disabled={isAdminLoading}
              error={!!adminError}
              darkMode={false}
            />
          </div>

          {/* Admin Error Message */}
          {adminError && (
            <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 px-4 py-3.5 rounded-xl mb-5">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{adminError}</p>
            </div>
          )}

          {/* Admin Loading */}
          {isAdminLoading && (
            <div className="flex justify-center mb-5">
              <Loading size="sm" message="認証中..." />
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleCloseAdminModal}
              className="btn btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => adminPin.length === 4 && handleAdminPinComplete(adminPin)}
              disabled={adminPin.length !== 4 || isAdminLoading}
              className="btn btn-primary flex-1"
            >
              ログイン
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
