import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Sparkles, Mail, Lock, Eye, EyeOff, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Loading } from '../components/common';

type Mode = 'login' | 'signup';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register, isAuthenticated, isAdmin } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      navigate(isAdmin ? '/admin' : '/clock');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  const resetFields = () => {
    setName('');
    setEmail('');
    setPassword('');
    setPasswordConfirm('');
    setError('');
  };

  const handleSwitchMode = (next: Mode) => {
    if (mode === next) return;
    setMode(next);
    resetFields();
  };

  const handleLoginSubmit = async () => {
    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }
    setIsLoading(true);
    setError('');
    const result = await login(email.trim(), password);
    if (result.success) {
      navigate(result.isAdmin ? '/admin' : '/clock');
    } else {
      setError(result.error || 'ログインに失敗しました');
      setPassword('');
    }
    setIsLoading(false);
  };

  const handleRegisterSubmit = async () => {
    if (!name.trim() || !email || !password || !passwordConfirm) {
      setError('全ての項目を入力してください');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('メールアドレスの形式が正しくありません');
      return;
    }
    if (password.length < 8) {
      setError('パスワードは8文字以上で設定してください');
      return;
    }
    if (password !== passwordConfirm) {
      setError('パスワードと確認用パスワードが一致しません');
      return;
    }
    setIsLoading(true);
    setError('');
    const result = await register({ name: name.trim(), email: email.trim(), password });
    if (result.success) {
      navigate('/clock');
    } else {
      setError(result.error || '登録に失敗しました');
    }
    setIsLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (mode === 'login') {
      handleLoginSubmit();
    } else {
      handleRegisterSubmit();
    }
  };

  const isLoginMode = mode === 'login';
  const submitDisabled = isLoading
    || !email
    || !password
    || (mode === 'signup' && (!name.trim() || !passwordConfirm));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white via-primary-50/30 to-white p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-gradient-to-br from-primary-200/20 to-transparent rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-tl from-primary-200/20 to-transparent rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

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

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-2 mb-5 bg-white/60 backdrop-blur-sm rounded-2xl p-1.5 border border-secondary-200">
          <button
            type="button"
            onClick={() => handleSwitchMode('login')}
            className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
              isLoginMode
                ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/25'
                : 'text-secondary-500 hover:text-primary-600'
            }`}
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('signup')}
            className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
              !isLoginMode
                ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/25'
                : 'text-secondary-500 hover:text-primary-600'
            }`}
          >
            新規登録
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card card-gold gold-border">
          <h2 className="text-lg font-semibold text-center text-secondary-800 mb-7 flex items-center justify-center gap-3">
            <span className="w-8 h-px bg-gradient-to-r from-transparent to-primary-400" />
            <span>{isLoginMode ? 'ログイン' : 'スタッフ新規登録'}</span>
            <span className="w-8 h-px bg-gradient-to-l from-transparent to-primary-400" />
          </h2>

          {/* Name (signup only) */}
          {!isLoginMode && (
            <div className="mb-5">
              <label className="label">氏名</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-secondary-400" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="例: 佐藤 花子"
                  disabled={isLoading}
                  autoComplete="name"
                  className="input pl-11"
                />
              </div>
            </div>
          )}

          {/* Email */}
          <div className="mb-5">
            <label className="label">メールアドレス</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-secondary-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="staff@example.com"
                disabled={isLoading}
                autoComplete="email"
                className="input pl-11"
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-5">
            <label className="label">
              パスワード
              {!isLoginMode && <span className="ml-2 text-xs text-secondary-400 font-normal">（8文字以上）</span>}
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-secondary-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isLoginMode ? 'パスワード' : '新しいパスワード'}
                disabled={isLoading}
                autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                className="input pl-11 pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-secondary-400 hover:text-primary-600 transition-colors"
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
              </button>
            </div>
          </div>

          {/* Password confirm (signup only) */}
          {!isLoginMode && (
            <div className="mb-6">
              <label className="label">パスワード（確認）</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-secondary-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  placeholder="同じパスワードをもう一度"
                  disabled={isLoading}
                  autoComplete="new-password"
                  className="input pl-11"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 px-4 py-3.5 rounded-xl mb-5">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex justify-center mb-5">
              <Loading size="sm" message={isLoginMode ? 'ログイン中...' : '登録中...'} />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitDisabled}
            className="btn btn-primary w-full btn-large"
          >
            {isLoginMode ? 'ログイン' : '登録してログイン'}
          </button>

          <p className="mt-5 text-xs text-center text-secondary-500">
            {isLoginMode
              ? '管理者・スタッフ共通のログイン画面です'
              : '管理者アカウントは別途、管理者にて作成されます'}
          </p>
        </form>

        <div className="mt-12 text-center">
          <p className="text-xs text-secondary-400 tracking-wider">
            &copy; 2025 KATEstageLASH. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
