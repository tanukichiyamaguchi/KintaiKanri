import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Save,
  AlertCircle,
  CheckCircle,
  History,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { insuranceApi } from '../../api';
import type { InsuranceRates } from '../../types';
import { Header, Loading } from '../../components/common';

export function SettingsPage() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rates, setRates] = useState<InsuranceRates>({
    effectiveDate: '',
    healthInsuranceRate: 4.905,
    nursingInsuranceRate: 0.80,
    pensionRate: 9.15,
    employmentInsuranceRate: 0.60,
  });
  const [history, setHistory] = useState<InsuranceRates[]>([]);

  // Redirect if not admin
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Fetch current rates
  useEffect(() => {
    async function fetchRates() {
      try {
        const response = await insuranceApi.get();
        if (response.success && response.data) {
          if (response.data.rates) {
            setRates(response.data.rates);
          }
          if (response.data.history) {
            setHistory(response.data.history);
          }
        }
      } catch {
        // Use default rates
      } finally {
        setIsLoading(false);
      }
    }

    fetchRates();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRates(prev => ({
      ...prev,
      [name]: name === 'effectiveDate' ? value : parseFloat(value) || 0,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!rates.effectiveDate) {
      setMessage({ type: 'error', text: '適用開始年月を入力してください' });
      return;
    }

    setIsSaving(true);

    try {
      const response = await insuranceApi.update({
        effectiveDate: rates.effectiveDate,
        healthInsuranceRate: rates.healthInsuranceRate,
        nursingInsuranceRate: rates.nursingInsuranceRate,
        pensionRate: rates.pensionRate,
        employmentInsuranceRate: rates.employmentInsuranceRate,
      });

      if (response.success) {
        setMessage({ type: 'success', text: '保険料率を保存しました' });
        // Refresh history
        const refreshResponse = await insuranceApi.get();
        if (refreshResponse.success && refreshResponse.data?.history) {
          setHistory(refreshResponse.data.history);
        }
      } else {
        setMessage({ type: 'error', text: response.error || '保存に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' });
    } finally {
      setIsSaving(false);
    }
  };

  // Generate year-month options
  const generateDateOptions = () => {
    const options: string[] = [];
    const now = new Date();
    for (let i = -12; i <= 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      options.push(`${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`);
    }
    return options;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="システム設定" />

      <main className="max-w-2xl mx-auto p-4 sm:p-6">
        {/* Back Link */}
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">ダッシュボードへ戻る</span>
        </Link>

        {isLoading ? (
          <div className="card">
            <Loading message="読み込み中..." />
          </div>
        ) : (
          <>
            {/* Insurance Rates Form */}
            <div className="card mb-6">
              <div className="flex items-center gap-2 mb-6">
                <SettingsIcon className="w-5 h-5 text-secondary-700 flex-shrink-0" />
                <h2 className="text-base sm:text-lg font-semibold text-secondary-800">
                  社会保険料率設定
                </h2>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  {/* Effective Date */}
                  <div>
                    <label className="label">適用開始年月</label>
                    <select
                      name="effectiveDate"
                      value={rates.effectiveDate}
                      onChange={e => setRates(prev => ({ ...prev, effectiveDate: e.target.value }))}
                      className="input"
                    >
                      <option value="">選択してください</option>
                      {generateDateOptions().map(date => (
                        <option key={date} value={date}>
                          {date.replace('-', '年')}月
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Health Insurance */}
                  <div>
                    <label className="label">健康保険料率（本人負担）</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="healthInsuranceRate"
                        value={rates.healthInsuranceRate}
                        onChange={handleInputChange}
                        step="0.001"
                        min="0"
                        max="100"
                        className="input"
                      />
                      <span className="text-secondary-600">％</span>
                    </div>
                    <p className="text-xs text-secondary-500 mt-1">
                      ※全国健康保険協会（協会けんぽ）の料率の半分を入力
                    </p>
                  </div>

                  {/* Nursing Insurance */}
                  <div>
                    <label className="label">介護保険料率（本人負担）</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="nursingInsuranceRate"
                        value={rates.nursingInsuranceRate}
                        onChange={handleInputChange}
                        step="0.001"
                        min="0"
                        max="100"
                        className="input"
                      />
                      <span className="text-secondary-600">％</span>
                    </div>
                    <p className="text-xs text-secondary-500 mt-1">
                      ※40歳以上65歳未満の方が対象
                    </p>
                  </div>

                  {/* Pension */}
                  <div>
                    <label className="label">厚生年金保険料率（本人負担）</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="pensionRate"
                        value={rates.pensionRate}
                        onChange={handleInputChange}
                        step="0.001"
                        min="0"
                        max="100"
                        className="input"
                      />
                      <span className="text-secondary-600">％</span>
                    </div>
                    <p className="text-xs text-secondary-500 mt-1">
                      ※18.3%の半分（9.15%）が一般的
                    </p>
                  </div>

                  {/* Employment Insurance */}
                  <div>
                    <label className="label">雇用保険料率（本人負担）</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        name="employmentInsuranceRate"
                        value={rates.employmentInsuranceRate}
                        onChange={handleInputChange}
                        step="0.001"
                        min="0"
                        max="100"
                        className="input"
                      />
                      <span className="text-secondary-600">％</span>
                    </div>
                    <p className="text-xs text-secondary-500 mt-1">
                      ※2024年度は0.6%（一般の事業）
                    </p>
                  </div>

                  {/* Message */}
                  {message && (
                    <div
                      className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${
                        message.type === 'success'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}
                    >
                      {message.type === 'success' ? (
                        <CheckCircle className="w-5 h-5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      )}
                      <p className="text-sm font-medium">{message.text}</p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="btn btn-primary w-full"
                  >
                    <Save className="w-5 h-5" />
                    {isSaving ? '保存中...' : '保存'}
                  </button>
                </div>
              </form>
            </div>

            {/* Rate History */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <History className="w-5 h-5 text-secondary-700 flex-shrink-0" />
                <h3 className="font-semibold text-secondary-800">料率履歴</h3>
              </div>

              {history.length === 0 ? (
                <p className="text-center text-secondary-500 py-4">履歴がありません</p>
              ) : (
                <div className="space-y-3">
                  {history.map((rate, index) => (
                    <div
                      key={rate.effectiveDate}
                      className={`p-3.5 rounded-xl border ${
                        index === 0
                          ? 'bg-primary-50 border-primary-200'
                          : 'bg-secondary-50 border-secondary-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-medium text-secondary-800 truncate">
                          {rate.effectiveDate.replace('-', '年')}月〜
                        </span>
                        {index === 0 && (
                          <span className="text-xs bg-primary-600 text-white px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                            適用中
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2 text-xs sm:text-sm text-secondary-600">
                        <span>健康保険: {rate.healthInsuranceRate}%</span>
                        <span>介護保険: {rate.nursingInsuranceRate}%</span>
                        <span>厚生年金: {rate.pensionRate}%</span>
                        <span>雇用保険: {rate.employmentInsuranceRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Note */}
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <h4 className="font-medium text-amber-800 mb-2">注意事項</h4>
              <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
                <li>毎年3月に協会けんぽの料率が改定されます</li>
                <li>都道府県によって健康保険料率が異なります</li>
                <li>料率変更は翌月分の給与計算から適用されます</li>
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
