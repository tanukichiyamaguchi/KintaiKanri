import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Sparkles, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Loading } from '../components/common';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, isAdmin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      navigate(isAdmin ? '/admin' : '/clock');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-white via-primary-50/30 to-white p-4 relative overflow-hidden">
      {/* Decorative background */}
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

        {/* Login Card */}
        <form onSubmit={handleSubmit} className="card card-gold gold-border">
          <h2 className="text-lg font-semibold text-center text-secondary-800 mb-8 flex items-center justify-center gap-3">
            <span className="w-8 h-px bg-gradient-to-r from-transparent to-primary-400" />
            <span>ログイン</span>
            <span className="w-8 h-px bg-gradient-to-l from-transparent to-primary-400" />
          </h2>

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
          <div className="mb-6">
            <label className="label">パスワード</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-secondary-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="パスワード"
                disabled={isLoading}
                autoComplete="current-password"
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
              <Loading size="sm" message="ログイン中..." />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!email || !password || isLoading}
            className="btn btn-primary w-full btn-large"
          >
            ログイン
          </button>

          <p className="mt-5 text-xs text-center text-secondary-500">
            管理者・スタッフ共通のログイン画面です
          </p>
        </form>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-secondary-400 tracking-wider">
            &copy; 2025 KATEstageLASH. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
