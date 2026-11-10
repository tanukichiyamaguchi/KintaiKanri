import { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Spinner } from '../components/common';

type Mode = 'login' | 'signup';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register, isAuthenticated, isAdmin } = useAuth();
  const ids = useId();

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

  // 1 行 = 見出し + 入力欄（iOS の「設定」アプリのサインイン画面と同じ並び）
  const fieldRow = (id: string, label: string, input: React.ReactNode, trailing?: React.ReactNode) => (
    <div className="list-row !py-0 min-h-[50px]">
      <label htmlFor={id} className="t-body w-[6.2em] flex-shrink-0">
        {label}
      </label>
      {input}
      {trailing}
    </div>
  );
  const inputClass = 't-body flex-1 min-w-0 h-[50px] bg-transparent outline-none placeholder:text-label-3';

  return (
    <div className="min-h-dvh bg-canvas">
      <main
        className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-4 py-10"
        style={{ paddingTop: 'calc(40px + var(--safe-top))', paddingBottom: 'calc(40px + var(--safe-bottom))' }}
      >
        <div className="text-center">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="KATE stage LASH kamata"
            className="logo-adaptive mx-auto h-36 w-36 object-contain"
          />
          <h1 className="t-title2 mt-1">勤怠管理</h1>
        </div>

        <div className="segmented mt-7" role="tablist" aria-label="ログインか新規登録かを選ぶ">
          <button
            type="button"
            role="tab"
            aria-selected={isLoginMode}
            onClick={() => handleSwitchMode('login')}
            className="segmented-item"
          >
            ログイン
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isLoginMode}
            onClick={() => handleSwitchMode('signup')}
            className="segmented-item"
          >
            新規登録
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5" noValidate>
          <div className="list-group">
            {!isLoginMode &&
              fieldRow(
                `${ids}-name`,
                '氏名',
                <input
                  id={`${ids}-name`}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="佐藤 花子"
                  disabled={isLoading}
                  autoComplete="name"
                  className={inputClass}
                />
              )}
            {fieldRow(
              `${ids}-email`,
              'メール',
              <input
                id={`${ids}-email`}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="staff@example.com"
                disabled={isLoading}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                className={inputClass}
              />
            )}
            {fieldRow(
              `${ids}-password`,
              'パスワード',
              <input
                id={`${ids}-password`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isLoginMode ? '必須' : '8文字以上'}
                disabled={isLoading}
                autoComplete={isLoginMode ? 'current-password' : 'new-password'}
                className={inputClass}
              />,
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="-mr-2 grid h-11 w-11 flex-shrink-0 place-items-center text-label-3 active:opacity-60"
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
              </button>
            )}
            {!isLoginMode &&
              fieldRow(
                `${ids}-confirm`,
                '確認用',
                <input
                  id={`${ids}-confirm`}
                  type={showPassword ? 'text' : 'password'}
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  placeholder="もう一度入力"
                  disabled={isLoading}
                  autoComplete="new-password"
                  className={inputClass}
                />
              )}
          </div>

          {error && (
            <div className="callout callout-danger mt-4" role="alert">
              <AlertCircle aria-hidden="true" />
              <p className="font-medium break-words">{error}</p>
            </div>
          )}

          <button type="submit" disabled={submitDisabled} className="btn btn-filled btn-lg btn-block mt-5">
            {isLoading && <Spinner size={18} className="!text-current" />}
            {isLoading
              ? isLoginMode ? 'ログインしています…' : '登録しています…'
              : isLoginMode ? 'ログイン' : '登録してログイン'}
          </button>

          {!isLoginMode && (
            <p className="t-footnote mt-4 text-center text-label-2">管理者のアカウントは、管理者が作成します</p>
          )}
        </form>
      </main>
    </div>
  );
}
