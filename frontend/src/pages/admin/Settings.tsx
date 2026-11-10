import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { insuranceApi } from '../../api';
import type { InsuranceRates } from '../../types';
import { Header, Loading } from '../../components/common';

// 料率の行: 1 行目に「見出し + 入力欄」、2 行目に補足を行の幅いっぱいに出す
const RATE_ROW = 'list-row flex-wrap !gap-y-1';
// 料率の行の右側に置く、小さめの数値入力欄
const RATE_INPUT = 'input !w-[5.75rem] !min-h-9 !py-1.5 !px-2.5 text-right tabular';
// 料率の行の補足
const RATE_HINT = 'w-full t-footnote text-label-2';

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
    <div className="page">
      <Header title="システム設定" backTo="/admin/more" backLabel="その他" backMobileOnly />

      <main className="page-content">
        {isLoading ? (
          <div className="card mt-2">
            <Loading message="読み込み中..." />
          </div>
        ) : (
          <>
            {/* Insurance Rates Form */}
            <form onSubmit={handleSubmit} className="section">
              <h2 className="section-header">社会保険料率設定</h2>
              <div className="list-group">
                {/* Effective Date */}
                <div className="list-row">
                  <label htmlFor="settings-effective-date" className="list-row-title t-body">
                    適用開始年月
                  </label>
                  <select
                    id="settings-effective-date"
                    name="effectiveDate"
                    value={rates.effectiveDate}
                    onChange={e => setRates(prev => ({ ...prev, effectiveDate: e.target.value }))}
                    className="input !w-auto !min-h-9 !py-1.5 !pl-3 tabular"
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
                <div className={RATE_ROW}>
                  <label htmlFor="settings-health" className="list-row-title t-body">
                    健康保険料率<span className="whitespace-nowrap t-subhead text-label-2">（本人負担）</span>
                  </label>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <input
                      id="settings-health"
                      type="number"
                      name="healthInsuranceRate"
                      value={rates.healthInsuranceRate}
                      onChange={handleInputChange}
                      step="0.001"
                      min="0"
                      max="100"
                      className={RATE_INPUT}
                    />
                    <span className="t-body text-label-2">％</span>
                  </div>
                  <p className={RATE_HINT}>
                    ※全国健康保険協会（協会けんぽ）の料率の半分を入力
                  </p>
                </div>

                {/* Nursing Insurance */}
                <div className={RATE_ROW}>
                  <label htmlFor="settings-nursing" className="list-row-title t-body">
                    介護保険料率<span className="whitespace-nowrap t-subhead text-label-2">（本人負担）</span>
                  </label>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <input
                      id="settings-nursing"
                      type="number"
                      name="nursingInsuranceRate"
                      value={rates.nursingInsuranceRate}
                      onChange={handleInputChange}
                      step="0.001"
                      min="0"
                      max="100"
                      className={RATE_INPUT}
                    />
                    <span className="t-body text-label-2">％</span>
                  </div>
                  <p className={RATE_HINT}>
                    ※40歳以上65歳未満の方が対象
                  </p>
                </div>

                {/* Pension */}
                <div className={RATE_ROW}>
                  <label htmlFor="settings-pension" className="list-row-title t-body">
                    厚生年金保険料率<span className="whitespace-nowrap t-subhead text-label-2">（本人負担）</span>
                  </label>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <input
                      id="settings-pension"
                      type="number"
                      name="pensionRate"
                      value={rates.pensionRate}
                      onChange={handleInputChange}
                      step="0.001"
                      min="0"
                      max="100"
                      className={RATE_INPUT}
                    />
                    <span className="t-body text-label-2">％</span>
                  </div>
                  <p className={RATE_HINT}>
                    ※18.3%の半分（9.15%）が一般的
                  </p>
                </div>

                {/* Employment Insurance */}
                <div className={RATE_ROW}>
                  <label htmlFor="settings-employment" className="list-row-title t-body">
                    雇用保険料率<span className="whitespace-nowrap t-subhead text-label-2">（本人負担）</span>
                  </label>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <input
                      id="settings-employment"
                      type="number"
                      name="employmentInsuranceRate"
                      value={rates.employmentInsuranceRate}
                      onChange={handleInputChange}
                      step="0.001"
                      min="0"
                      max="100"
                      className={RATE_INPUT}
                    />
                    <span className="t-body text-label-2">％</span>
                  </div>
                  <p className={RATE_HINT}>
                    ※2024年度は0.6%（一般の事業）
                  </p>
                </div>
              </div>

              {/* Message */}
              {message && (
                <div
                  className={`callout mt-4 ${
                    message.type === 'success' ? 'callout-success' : 'callout-danger'
                  }`}
                  role={message.type === 'error' ? 'alert' : 'status'}
                >
                  {message.type === 'success' ? (
                    <CheckCircle aria-hidden="true" />
                  ) : (
                    <AlertCircle aria-hidden="true" />
                  )}
                  <p className="font-medium break-words">{message.text}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSaving}
                className="btn btn-filled btn-lg btn-block mt-5"
              >
                <Save aria-hidden="true" />
                {isSaving ? '保存中...' : '保存'}
              </button>
            </form>

            {/* Rate History */}
            <section className="section">
              <h2 className="section-header">料率履歴</h2>
              <div className="list-group">
                {history.length === 0 ? (
                  <div className="list-row justify-center">
                    <span className="t-body text-label-2">履歴がありません</span>
                  </div>
                ) : (
                  history.map((rate, index) => (
                    <div key={rate.effectiveDate} className="list-row">
                      <div className="list-row-title">
                        <div className="flex items-center justify-between gap-2">
                          <span className="t-body tabular truncate">
                            {rate.effectiveDate.replace('-', '年')}月〜
                          </span>
                          {index === 0 && (
                            <span className="pill pill-tint flex-shrink-0">適用中</span>
                          )}
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 t-footnote tabular text-label-2 sm:grid-cols-4">
                          <span>健康保険: {rate.healthInsuranceRate}%</span>
                          <span>介護保険: {rate.nursingInsuranceRate}%</span>
                          <span>厚生年金: {rate.pensionRate}%</span>
                          <span>雇用保険: {rate.employmentInsuranceRate}%</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Note */}
            <div className="callout callout-warning mt-6">
              <AlertTriangle aria-hidden="true" />
              <div className="min-w-0">
                <h3 className="font-semibold">注意事項</h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 t-footnote">
                  <li>毎年3月に協会けんぽの料率が改定されます</li>
                  <li>都道府県によって健康保険料率が異なります</li>
                  <li>料率変更は翌月分の給与計算から適用されます</li>
                </ul>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
