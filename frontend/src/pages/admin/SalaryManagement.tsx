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
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="給与計算" />

      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Back Link */}
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">ダッシュボードへ戻る</span>
        </Link>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 text-red-600 bg-red-50 border border-red-200 px-5 py-4 rounded-xl mb-5">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Controls */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3 sm:gap-4">
            {/* Month Selector */}
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={handlePreviousMonth}
                className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-primary-50 transition-colors"
                aria-label="前月"
              >
                <ChevronLeft className="w-5 h-5 text-secondary-600" />
              </button>
              <span className="text-base sm:text-lg font-semibold min-w-[140px] text-center text-secondary-800">
                {selectedYear}年{selectedMonth}月分
              </span>
              <button
                onClick={handleNextMonth}
                className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-primary-50 transition-colors"
                aria-label="次月"
              >
                <ChevronRight className="w-5 h-5 text-secondary-600" />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleCalculate}
                disabled={isCalculating}
                className="btn btn-primary flex-1 sm:flex-none !text-sm sm:!text-base !py-2.5 !px-3 sm:!px-5"
              >
                {isCalculating ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Calculator className="w-5 h-5" />
                )}
                <span className="hidden sm:inline">給与計算実行</span>
                <span className="sm:hidden">計算</span>
              </button>
              <button
                onClick={handleDownloadAllPdf}
                disabled={salaryData.length === 0}
                className="btn btn-secondary flex-1 sm:flex-none !text-sm sm:!text-base !py-2.5 !px-3 sm:!px-5"
              >
                <Download className="w-5 h-5" />
                <span className="hidden sm:inline">一括PDF</span>
                <span className="sm:hidden">PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tax Input Section */}
        <div className="card mb-6">
          <h3 className="font-semibold text-secondary-800 mb-2">税金入力（所得税・住民税）</h3>
          <p className="text-sm text-secondary-500 mb-4">
            所得税と住民税は自動計算されないため、手動で入力してください。
          </p>

          {isLoading ? (
            <Loading />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {staffList.map(staff => {
                const tax = getStaffTax(staff.staffId);
                return (
                  <div
                    key={staff.staffId}
                    className="p-4 bg-secondary-50 border border-secondary-100 rounded-xl flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-secondary-800 truncate">{staff.name}</p>
                      <div className="text-xs text-secondary-600 mt-1">
                        <span>所得税: {formatCurrency(tax?.incomeTax || 0)}</span>
                        <span className="mx-2 text-secondary-300">|</span>
                        <span>住民税: {formatCurrency(tax?.residentTax || 0)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpenTaxModal(staff.staffId)}
                      className="btn btn-secondary !py-1.5 !px-3 !text-xs !rounded-lg flex-shrink-0"
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
          <>
            {/* Section header */}
            <div className="mb-3 sm:hidden">
              <h3 className="font-semibold text-secondary-800">給与計算結果</h3>
            </div>

            {/* Mobile: Card list */}
            <div className="sm:hidden space-y-3">
              {salaryData.map(record => {
                const socialInsurance =
                  record.healthInsurance +
                  record.nursingInsurance +
                  record.pension +
                  record.employmentInsurance;
                const taxes = record.incomeTax + record.residentTax;

                return (
                  <div key={record.staffId} className="card !p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="font-semibold text-secondary-800 truncate">
                        {record.name}
                      </p>
                      <button
                        onClick={() => handleDownloadPdf(record.staffId)}
                        className="flex items-center justify-center w-11 h-11 text-secondary-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors flex-shrink-0"
                        aria-label="PDFダウンロード"
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-secondary-500">基本給</span>
                        <span className="text-secondary-700">{formatCurrency(record.baseSalary)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary-500">残業手当</span>
                        <span className="text-secondary-700">{formatCurrency(record.overtimePay)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary-500">交通費</span>
                        <span className="text-secondary-700">{formatCurrency(record.transportation)}</span>
                      </div>
                      <div className="flex justify-between border-t border-secondary-100 pt-1.5">
                        <span className="text-secondary-600 font-medium">総支給額</span>
                        <span className="font-medium text-secondary-800">{formatCurrency(record.grossPay)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary-500">社会保険料</span>
                        <span className="text-red-600">-{formatCurrency(socialInsurance)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary-500">税金</span>
                        <span className="text-red-600">-{formatCurrency(taxes)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-secondary-500">控除計</span>
                        <span className="text-red-600">-{formatCurrency(record.totalDeduction)}</span>
                      </div>
                      <div className="flex justify-between border-t border-secondary-100 pt-1.5">
                        <span className="text-secondary-700 font-semibold">差引支給額</span>
                        <span className="font-bold text-primary-700">{formatCurrency(record.netPay)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: Table */}
            <div className="hidden sm:block card overflow-x-auto p-0 overflow-hidden">
              <div className="px-6 py-5">
                <h3 className="font-semibold text-secondary-800">給与計算結果</h3>
              </div>

              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-secondary-800 to-secondary-900 text-white">
                    <th className="px-3 py-3 text-left text-xs font-semibold tracking-wider">氏名</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold tracking-wider">基本給</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold tracking-wider">残業手当</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold tracking-wider">交通費</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold tracking-wider">総支給額</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold tracking-wider">社会保険料</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold tracking-wider">税金</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold tracking-wider">控除計</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold tracking-wider">差引支給額</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold tracking-wider">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100">
                  {salaryData.map(record => {
                    const socialInsurance =
                      record.healthInsurance +
                      record.nursingInsurance +
                      record.pension +
                      record.employmentInsurance;
                    const taxes = record.incomeTax + record.residentTax;

                    return (
                      <tr key={record.staffId} className="hover:bg-primary-50/30 transition-colors">
                        <td className="px-3 py-3 font-medium text-secondary-800">
                          {record.name}
                        </td>
                        <td className="px-3 py-3 text-right text-secondary-700">
                          {formatCurrency(record.baseSalary)}
                        </td>
                        <td className="px-3 py-3 text-right text-secondary-700">
                          {formatCurrency(record.overtimePay)}
                        </td>
                        <td className="px-3 py-3 text-right text-secondary-700">
                          {formatCurrency(record.transportation)}
                        </td>
                        <td className="px-3 py-3 text-right font-medium text-secondary-800">
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
                            className="p-1.5 text-secondary-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            aria-label="PDFダウンロード"
                            title="PDFダウンロード"
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
          </>
        )}

        {/* Empty State */}
        {!isLoading && salaryData.length === 0 && (
          <div className="card text-center py-12">
            <Calculator className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
            <p className="text-secondary-500 mb-2">給与計算結果がありません</p>
            <p className="text-sm text-secondary-400">
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
