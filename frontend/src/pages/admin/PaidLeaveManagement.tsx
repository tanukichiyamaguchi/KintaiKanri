import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi, paidLeaveApi } from '../../api';
import type { StaffInfo, PaidLeaveRequest, Staff } from '../../types';
import { Header, Loading } from '../../components/common';

// 小さいボタン（見た目は高さ 32px）の押せる範囲を、上下に広げて 44px にする
const SMALL_BUTTON_HIT = "relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']";

export function PaidLeaveManagement() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuth();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [requests, setRequests] = useState<PaidLeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch staff list with details
        const staffResponse = await staffApi.getList();
        if (staffResponse.success && staffResponse.data) {
          const detailedStaff = await Promise.all(
            staffResponse.data
              .filter(s => s.status === 'active')
              .map(async (s: StaffInfo) => {
                const detailRes = await staffApi.getDetails(s.staffId);
                return detailRes.data || s;
              })
          );
          setStaffList(detailedStaff as Staff[]);
        }

        // Fetch requests
        const requestsResponse = await paidLeaveApi.getAll();
        if (requestsResponse.success && requestsResponse.data) {
          setRequests(requestsResponse.data);
        }
      } catch {
        setMessage({ type: 'error', text: 'データの取得に失敗しました' });
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  const handleApprove = async (requestId: string) => {
    try {
      const response = await paidLeaveApi.updateStatus(requestId, 'approved');
      if (response.success) {
        setRequests(prev =>
          prev.map(r =>
            r.id === requestId
              ? { ...r, status: 'approved' as const, approvedDate: new Date().toISOString() }
              : r
          )
        );
        setMessage({ type: 'success', text: '有給休暇を承認しました' });
      } else {
        setMessage({ type: 'error', text: response.error || '承認に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '承認に失敗しました' });
    }
  };

  const handleReject = async (requestId: string) => {
    try {
      const response = await paidLeaveApi.updateStatus(requestId, 'rejected');
      if (response.success) {
        setRequests(prev =>
          prev.map(r => (r.id === requestId ? { ...r, status: 'rejected' as const } : r))
        );
        setMessage({ type: 'success', text: '有給休暇を却下しました' });
      } else {
        setMessage({ type: 'error', text: response.error || '却下に失敗しました' });
      }
    } catch {
      setMessage({ type: 'error', text: '却下に失敗しました' });
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  const getStatusBadge = (status: PaidLeaveRequest['status']) => {
    switch (status) {
      case 'pending':
        return <span className="pill pill-warning flex-shrink-0">申請中</span>;
      case 'approved':
        return <span className="pill pill-success flex-shrink-0">承認済</span>;
      case 'rejected':
        return <span className="pill pill-danger flex-shrink-0">却下</span>;
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div className="page">
      <Header title="有給休暇" backTo="/admin/more" backLabel="その他" backMobileOnly />

      <main className="page-content">
        {/* 結果のお知らせ */}
        {message && (
          <div
            className={`callout mt-2 ${message.type === 'success' ? 'callout-success' : 'callout-danger'}`}
            role={message.type === 'error' ? 'alert' : 'status'}
          >
            {message.type === 'success' ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
            <p className="font-medium break-words">{message.text}</p>
          </div>
        )}

        {isLoading ? (
          <div className="card mt-2">
            <Loading message="読み込み中..." />
          </div>
        ) : (
          <>
            {/* 承認待ちの申請（このページで主に行う操作なので先頭に置く） */}
            <section className="section">
              <h2 className="section-header">
                承認待ち申請
                {pendingRequests.length > 0 && <span className="tabular">{pendingRequests.length}件</span>}
              </h2>
              <div className="list-group">
                {pendingRequests.length === 0 ? (
                  <div className="list-row">
                    <span className="t-body text-label-2">承認待ちの申請はありません</span>
                  </div>
                ) : (
                  pendingRequests.map(request => (
                    <div key={request.id} className="list-row">
                      <div className="list-row-title">
                        <p className="t-body truncate">{request.name}</p>
                        <p className="t-footnote text-label-2 tabular">取得希望日: {formatDate(request.leaveDate)}</p>
                        <p className="t-footnote text-label-2 tabular">申請日: {formatDate(request.requestDate)}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(request.id)}
                          className={`btn btn-sm btn-filled ${SMALL_BUTTON_HIT}`}
                        >
                          <Check aria-hidden="true" />
                          承認
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(request.id)}
                          className={`btn btn-sm btn-danger-tinted ${SMALL_BUTTON_HIT}`}
                        >
                          <X aria-hidden="true" />
                          却下
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* スタッフ別の残日数 */}
            <section className="section">
              <h2 className="section-header">スタッフ別有給残日数</h2>
              <div className="list-group">
                {staffList.length === 0 ? (
                  <div className="list-row">
                    <span className="t-body text-label-2">有効なスタッフがいません</span>
                  </div>
                ) : (
                  staffList.map(staff => (
                    <div key={staff.staffId} className="list-row">
                      <span className="list-row-title t-body truncate">{staff.name}</span>
                      <span className="list-row-detail tabular">{staff.paidLeaveBalance}日</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* 処理済みの申請 */}
            <section className="section">
              <h2 className="section-header">処理済み申請履歴</h2>
              <div className="list-group">
                {processedRequests.length === 0 ? (
                  <div className="list-row">
                    <span className="t-body text-label-2">処理済みの申請はありません</span>
                  </div>
                ) : (
                  processedRequests.map(request => (
                    <div key={request.id} className="list-row">
                      <div className="list-row-title">
                        <p className="t-body truncate">{request.name}</p>
                        <p className="t-footnote text-label-2 tabular flex flex-wrap gap-x-3">
                          <span>取得日: {formatDate(request.leaveDate)}</span>
                          <span>申請日: {formatDate(request.requestDate)}</span>
                        </p>
                      </div>
                      {getStatusBadge(request.status)}
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
