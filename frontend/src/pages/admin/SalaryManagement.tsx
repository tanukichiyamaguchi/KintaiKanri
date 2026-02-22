import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Calculator,
  Download,
  FileText,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi, salaryApi, taxApi } from '../../api';
import type { StaffInfo, SalaryRecord, TaxManual } from '../../types';
import { Header, Loading, Modal } from '../../components/common';
import { formatCurrency } from '../../utils/calculations';

export function SalaryManagement() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuth();

  const [staffList, setStaffList] = useState<StaffInfo[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [salaryData, setSalaryData] = useState<SalaryRecord[]>([]);
  const [taxData, setTaxData] = useState<TaxManual[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [selectedStaffForTax, setSelectedStaffForTax] = useState<string | null>(null);
  const [taxInput, setTaxInput] = useState({ incomeTax: 0, residentTax: 0 });
  const [error, setError] = useState<string | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        // Fetch staff list
        const staffResponse = await staffApi.getList();
        if (staffResponse.success && staffResponse.data) {
          setStaffList(staffResponse.data.filter(s => s.status === 'active'));
        }

        // Fetch tax data
        const taxResponse = await taxApi.getMonthly(selectedYear, selectedMonth);
        if (taxResponse.success && taxResponse.data) {
          setTaxData(taxResponse.data);
        }
      } catch {
        setError('データの取得に失敗しました');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [selectedYear, selectedMonth]);

  const handlePreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(selectedYear - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear(selectedYear + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const handleCalculate = async () => {
    setIsCalculating(true);
    try {
      const response = await salaryApi.calculate(selectedYear, selectedMonth);
      if (response.success && response.data) {
        setSalaryData(response.data);
        setError(null);
      } else {
        setError(response.error || '給与計算に失敗しました');
      }
    } catch {
      setError('給与計算に失敗しました');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleOpenTaxModal = (staffId: string) => {
    const existingTax = taxData.find(t => t.staffId === staffId);
    setSelectedStaffForTax(staffId);
    setTaxInput({
      incomeTax: existingTax?.incomeTax || 0,
      residentTax: existingTax?.residentTax || 0,
    });
    setShowTaxModal(true);
  };

  const handleSaveTax = async () => {
    if (!selectedStaffForTax) return;

    try {
      await taxApi.update(
        selectedStaffForTax,
        selectedYear,
        selectedMonth,
        taxInput.incomeTax,
        taxInput.residentTax
      );

      // Refresh tax data
      const taxResponse = await taxApi.getMonthly(selectedYear, selectedMonth);
      if (taxResponse.success && taxResponse.data) {
        setTaxData(taxResponse.data);
      }

      setShowTaxModal(false);
      setSelectedStaffForTax(null);
    } catch {
      setError('税金の保存に失敗しました');
    }
  };

  const handleDownloadPdf = (staffId: string) => {
    const url = salaryApi.getPdf(staffId, selectedYear, selectedMonth);
    window.open(url, '_blank');
  };

  const handleDownloadAllPdf = () => {
    const url = salaryApi.getAllPdf(selectedYear, selectedMonth);
    window.open(url, '_blank');
  };

  const getStaffName = (staffId: string): string => {
    return staffList.find(s => s.staffId === staffId)?.name || staffId;
  };

  const getStaffTax = (staffId: string): TaxManual | undefined => {
    return taxData.find(t => t.staffId === staffId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="給与計算" />

      <main className="max-w-6xl mx-auto p-4">
        {/* Back Link */}
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 text-gray-600 hover:text-primary-600 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          ダッシュボードへ戻る
        </Link>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg mb-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="card mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Month Selector */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePreviousMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <span className="text-lg font-semibold min-w-[120px] text-center">
                {selectedYear}年{selectedMonth}月分
              </span>
              <button
                onClick={handleNextMonth}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCalculate}
                disabled={isCalculating}
                className="btn btn-primary"
              >
                {isCalculating ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Calculator className="w-5 h-5" />
                )}
                給与計算実行
              </button>
              <button
                onClick={handleDownloadAllPdf}
                disabled={salaryData.length === 0}
                className="btn btn-secondary"
              >
                <Download className="w-5 h-5" />
                一括PDF
              </button>
            </div>
          </div>
        </div>

        {/* Tax Input Section */}
        <div className="card mb-6">
          <h3 className="font-semibold text-gray-800 mb-4">税金入力（所得税・住民税）</h3>
          <p className="text-sm text-gray-500 mb-4">
            所得税と住民税は自動計算されないため、手動で入力してください。
          </p>

          {isLoading ? (
            <Loading />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffList.map(staff => {
                const tax = getStaffTax(staff.staffId);
                return (
                  <div
                    key={staff.staffId}
                    className="p-4 bg-gray-50 rounded-lg flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{staff.name}</p>
                      <div className="text-sm text-gray-600 mt-1">
                        <span>所得税: {formatCurrency(tax?.incomeTax || 0)}</span>
                        <span className="mx-2">|</span>
                        <span>住民税: {formatCurrency(tax?.residentTax || 0)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpenTaxModal(staff.staffId)}
                      className="btn btn-secondary py-1 px-3 text-sm"
                    >
                      編集
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Salary Results */}
        {salaryData.length > 0 && (
          <div className="card overflow-x-auto">
            <h3 className="font-semibold text-gray-800 mb-4">給与計算結果</h3>

            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">氏名</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">基本給</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">残業手当</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">交通費</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">総支給額</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">社会保険料</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">税金</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">控除計</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">差引支給額</th>
                  <th className="px-3 py-2 text-center font-medium text-gray-600">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {salaryData.map(record => {
                  const socialInsurance =
                    record.healthInsurance +
                    record.nursingInsurance +
                    record.pension +
                    record.employmentInsurance;
                  const taxes = record.incomeTax + record.residentTax;

                  return (
                    <tr key={record.staffId} className="hover:bg-gray-50">
                      <td className="px-3 py-3 font-medium text-gray-800">
                        {record.name}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700">
                        {formatCurrency(record.baseSalary)}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700">
                        {formatCurrency(record.overtimePay)}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700">
                        {formatCurrency(record.transportation)}
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-gray-800">
                        {formatCurrency(record.grossPay)}
                      </td>
                      <td className="px-3 py-3 text-right text-red-600">
                        -{formatCurrency(socialInsurance)}
                      </td>
                      <td className="px-3 py-3 text-right text-red-600">
                        -{formatCurrency(taxes)}
                      </td>
                      <td className="px-3 py-3 text-right text-red-600">
                        -{formatCurrency(record.totalDeduction)}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-primary-700">
                        {formatCurrency(record.netPay)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={() => handleDownloadPdf(record.staffId)}
                          className="p-1 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && salaryData.length === 0 && (
          <div className="card text-center py-12">
            <Calculator className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">給与計算結果がありません</p>
            <p className="text-sm text-gray-400">
              「給与計算実行」ボタンをクリックして計算を開始してください
            </p>
          </div>
        )}
      </main>

      {/* Tax Input Modal */}
      <Modal
        isOpen={showTaxModal}
        onClose={() => setShowTaxModal(false)}
        title={`税金入力 - ${selectedStaffForTax ? getStaffName(selectedStaffForTax) : ''}`}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="label">所得税</label>
            <input
              type="number"
              value={taxInput.incomeTax}
              onChange={e => setTaxInput(prev => ({ ...prev, incomeTax: Number(e.target.value) }))}
              className="input"
              placeholder="5000"
            />
          </div>
          <div>
            <label className="label">住民税</label>
            <input
              type="number"
              value={taxInput.residentTax}
              onChange={e => setTaxInput(prev => ({ ...prev, residentTax: Number(e.target.value) }))}
              className="input"
              placeholder="12000"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setShowTaxModal(false)}
              className="btn btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button onClick={handleSaveTax} className="btn btn-primary flex-1">
              保存
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
