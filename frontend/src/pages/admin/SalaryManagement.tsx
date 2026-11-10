import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Calculator,
  Download,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi, salaryApi, taxApi } from '../../api';
import type { StaffInfo, SalaryRecord, TaxManual } from '../../types';
import { Header, Loading, Modal, Spinner } from '../../components/common';
import { formatCurrency } from '../../utils/calculations';

// 表（iPad・PC）の見出しセル
const TH = 't-footnote text-label-2 font-medium px-3 py-2.5 bg-surface sticky top-0 whitespace-nowrap';
// 表の金額セル
const TD_MONEY = 'px-3 py-3 text-right whitespace-nowrap';
// 前月・次月の丸いボタン
const STEP_BTN = 'grid h-11 w-11 place-items-center rounded-full text-tint transition-colors hover:bg-fill active:bg-fill-2';

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
    <div className="page">
      <Header title="給与計算" backTo="/admin/more" backLabel="その他" backMobileOnly wide />

      <main className="page-content page-content-wide">
        {/* Error */}
        {error && (
          <div className="callout callout-danger mb-4" role="alert">
            <AlertCircle aria-hidden="true" />
            <p className="font-medium break-words">{error}</p>
          </div>
        )}

        {/* Controls */}
        <section className="card" aria-label="対象月と操作">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            {/* Month Selector */}
            <div className="-mx-2 flex items-center justify-between sm:justify-start">
              <button type="button" onClick={handlePreviousMonth} className={STEP_BTN} aria-label="前月">
                <ChevronLeft className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
              </button>
              <p className="t-headline tabular min-w-[8.5em] text-center" aria-live="polite">
                {selectedYear}年{selectedMonth}月分
              </p>
              <button type="button" onClick={handleNextMonth} className={STEP_BTN} aria-label="次月">
                <ChevronRight className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex">
              <button
                type="button"
                onClick={handleCalculate}
                disabled={isCalculating}
                className="btn btn-filled"
              >
                {isCalculating ? (
                  <Spinner size={18} className="!text-current" />
                ) : (
                  <Calculator aria-hidden="true" />
                )}
                給与計算実行
              </button>
              <button
                type="button"
                onClick={handleDownloadAllPdf}
                disabled={salaryData.length === 0}
                className="btn btn-gray"
              >
                <Download aria-hidden="true" />
                一括PDF
              </button>
            </div>
          </div>
        </section>

        {/* Tax Input Section */}
        <section className="section">
          <h2 className="section-header">税金入力（所得税・住民税）</h2>

          {isLoading ? (
            <div className="card">
              <Loading />
            </div>
          ) : (
            <div className="list-group empty:hidden">
              {staffList.map(staff => {
                const tax = getStaffTax(staff.staffId);
                return (
                  <div key={staff.staffId} className="list-row !py-2 !pr-2">
                    <span className="list-row-title t-body truncate">{staff.name}</span>
                    <dl className="grid grid-cols-[auto_auto] items-baseline gap-x-2 t-footnote tabular sm:flex sm:gap-6">
                      <div className="contents sm:flex sm:w-36 sm:justify-end sm:gap-2">
                        <dt className="text-label-2">所得税</dt>
                        <dd className="text-right">{formatCurrency(tax?.incomeTax || 0)}</dd>
                      </div>
                      <div className="contents sm:flex sm:w-36 sm:justify-end sm:gap-2">
                        <dt className="text-label-2">住民税</dt>
                        <dd className="text-right">{formatCurrency(tax?.residentTax || 0)}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={() => handleOpenTaxModal(staff.staffId)}
                      className="btn btn-plain flex-shrink-0"
                      aria-label={`${staff.name}の税金を編集`}
                    >
                      編集
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="section-footer">
            所得税と住民税は自動計算されないため、手動で入力してください。
          </p>
        </section>

        {/* Salary Results */}
        {salaryData.length > 0 && (
          <section className="section">
            <h2 className="section-header">給与計算結果</h2>

            {/* iPhone: Card list */}
            <div className="sm:hidden space-y-3">
              {salaryData.map(record => {
                const socialInsurance =
                  record.healthInsurance +
                  record.nursingInsurance +
                  record.pension +
                  record.employmentInsurance;
                const taxes = record.incomeTax + record.residentTax;

                return (
                  <article key={record.staffId} className="card">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="t-headline min-w-0 truncate">{record.name}</h3>
                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(record.staffId)}
                        className="btn btn-tinted -my-1 flex-shrink-0 !px-3.5 !text-[15px]"
                        aria-label="PDFダウンロード"
                      >
                        <FileText aria-hidden="true" />
                        PDF
                      </button>
                    </div>
                    <dl className="mt-2 t-subhead tabular">
                      <div className="flex justify-between gap-3 py-1">
                        <dt className="text-label-2">基本給</dt>
                        <dd>{formatCurrency(record.baseSalary)}</dd>
                      </div>
                      <div className="flex justify-between gap-3 py-1">
                        <dt className="text-label-2">残業手当</dt>
                        <dd>{formatCurrency(record.overtimePay)}</dd>
                      </div>
                      <div className="flex justify-between gap-3 py-1">
                        <dt className="text-label-2">交通費</dt>
                        <dd>{formatCurrency(record.transportation)}</dd>
                      </div>
                      <div className="mt-1 flex justify-between gap-3 border-t-[0.5px] border-separator pt-2 pb-1 t-headline">
                        <dt>総支給額</dt>
                        <dd>{formatCurrency(record.grossPay)}</dd>
                      </div>
                      <div className="mt-1 flex justify-between gap-3 py-1">
                        <dt className="text-label-2">社会保険料</dt>
                        <dd className="text-danger">-{formatCurrency(socialInsurance)}</dd>
                      </div>
                      <div className="flex justify-between gap-3 py-1">
                        <dt className="text-label-2">税金</dt>
                        <dd className="text-danger">-{formatCurrency(taxes)}</dd>
                      </div>
                      <div className="mt-1 flex justify-between gap-3 border-t-[0.5px] border-separator pt-2 pb-1 t-headline">
                        <dt>控除計</dt>
                        <dd className="text-danger">-{formatCurrency(record.totalDeduction)}</dd>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-3 rounded-[10px] bg-tint-fill px-3 py-2.5">
                        <dt className="t-headline">差引支給額</dt>
                        <dd className="t-title3 text-tint">{formatCurrency(record.netPay)}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>

            {/* iPad・PC: Table */}
            <div className="hidden sm:block card !p-0 overflow-x-auto">
              <table className="w-full min-w-[860px] t-subhead tabular">
                <thead>
                  <tr>
                    <th scope="col" className={`${TH} !pl-4 text-left`}>氏名</th>
                    <th scope="col" className={`${TH} text-right`}>基本給</th>
                    <th scope="col" className={`${TH} text-right`}>残業手当</th>
                    <th scope="col" className={`${TH} text-right`}>交通費</th>
                    <th scope="col" className={`${TH} text-right`}>総支給額</th>
                    <th scope="col" className={`${TH} text-right`}>社会保険料</th>
                    <th scope="col" className={`${TH} text-right`}>税金</th>
                    <th scope="col" className={`${TH} text-right`}>控除計</th>
                    <th scope="col" className={`${TH} text-right`}>差引支給額</th>
                    <th scope="col" className={`${TH} !pr-4 text-center`}>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryData.map(record => {
                    const socialInsurance =
                      record.healthInsurance +
                      record.nursingInsurance +
                      record.pension +
                      record.employmentInsurance;
                    const taxes = record.incomeTax + record.residentTax;

                    return (
                      <tr key={record.staffId} className="border-t-[0.5px] border-separator">
                        <td className="pl-4 pr-3 py-3 font-medium whitespace-nowrap">
                          {record.name}
                        </td>
                        <td className={TD_MONEY}>
                          {formatCurrency(record.baseSalary)}
                        </td>
                        <td className={TD_MONEY}>
                          {formatCurrency(record.overtimePay)}
                        </td>
                        <td className={TD_MONEY}>
                          {formatCurrency(record.transportation)}
                        </td>
                        <td className={`${TD_MONEY} font-semibold`}>
                          {formatCurrency(record.grossPay)}
                        </td>
                        <td className={`${TD_MONEY} text-danger`}>
                          -{formatCurrency(socialInsurance)}
                        </td>
                        <td className={`${TD_MONEY} text-danger`}>
                          -{formatCurrency(taxes)}
                        </td>
                        <td className={`${TD_MONEY} font-semibold text-danger`}>
                          -{formatCurrency(record.totalDeduction)}
                        </td>
                        <td className={`${TD_MONEY} font-semibold text-tint`}>
                          {formatCurrency(record.netPay)}
                        </td>
                        <td className="pl-2 pr-3 py-0">
                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(record.staffId)}
                            className="mx-auto grid h-11 w-11 place-items-center rounded-full text-tint transition-colors hover:bg-fill active:bg-fill-2"
                            aria-label="PDFダウンロード"
                            title="PDFダウンロード"
                          >
                            <FileText className="h-5 w-5" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Empty State */}
        {!isLoading && salaryData.length === 0 && (
          <section className="section">
            <div className="card flex flex-col items-center px-6 py-10 text-center">
              <Calculator className="h-12 w-12 text-label-4" strokeWidth={1.5} aria-hidden="true" />
              <p className="t-headline mt-3">給与計算結果がありません</p>
              <p className="t-subhead text-label-2 mt-1">
                「給与計算実行」ボタンをクリックして計算を開始してください
              </p>
            </div>
          </section>
        )}
      </main>

      {/* Tax Input Modal */}
      <Modal
        isOpen={showTaxModal}
        onClose={() => setShowTaxModal(false)}
        title={`税金入力 - ${selectedStaffForTax ? getStaffName(selectedStaffForTax) : ''}`}
        size="sm"
      >
        <div className="space-y-4 pt-2">
          <div>
            <label htmlFor="salary-income-tax" className="label">所得税</label>
            <input
              id="salary-income-tax"
              type="number"
              value={taxInput.incomeTax}
              onChange={e => setTaxInput(prev => ({ ...prev, incomeTax: Number(e.target.value) }))}
              className="input tabular"
              placeholder="5000"
            />
          </div>
          <div>
            <label htmlFor="salary-resident-tax" className="label">住民税</label>
            <input
              id="salary-resident-tax"
              type="number"
              value={taxInput.residentTax}
              onChange={e => setTaxInput(prev => ({ ...prev, residentTax: Number(e.target.value) }))}
              className="input tabular"
              placeholder="12000"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setShowTaxModal(false)}
            className="btn btn-gray"
          >
            キャンセル
          </button>
          <button type="button" onClick={handleSaveTax} className="btn btn-filled">
            保存
          </button>
        </div>
      </Modal>
    </div>
  );
}
