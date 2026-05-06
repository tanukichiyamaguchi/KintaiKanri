import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Palmtree,
  Check,
  X,
  Clock,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi, paidLeaveApi } from '../../api';
import type { StaffInfo, PaidLeaveRequest, Staff } from '../../types';
import { Header, Loading } from '../../components/common';

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
        return (
          <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-semibold">
            <Clock className="w-3.5 h-3.5" />
            申請中
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 text-green-700 bg-green-100 border border-green-200 px-2.5 py-1 rounded-full text-xs font-semibold">
            <CheckCircle className="w-3.5 h-3.5" />
            承認済
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 text-red-700 bg-red-100 border border-red-200 px-2.5 py-1 rounded-full text-xs font-semibold">
            <X className="w-3.5 h-3.5" />
            却下
          </span>
        );
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-secondary-100">
      <Header title="有給管理" />

      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        {/* Back Link */}
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-secondary-500 hover:text-primary-600 transition-colors mb-5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">ダッシュボードへ戻る</span>
        </Link>

        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-3 px-5 py-4 rounded-xl mb-5 border ${
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

        {isLoading ? (
          <div className="card">
            <Loading message="読み込み中..." />
          </div>
        ) : (
          <>
            {/* Staff Balance Overview */}
            <div className="card mb-6">
              <h2 className="text-lg font-semibold text-secondary-800 mb-4 flex items-center gap-2">
                <Palmtree className="w-5 h-5 text-primary-500" />
                スタッフ別有給残日数
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {staffList.map(staff => (
                  <div
                    key={staff.staffId}
                    className="p-4 bg-secondary-50 border border-secondary-100 rounded-xl text-center"
                  >
                    <p className="font-medium text-secondary-800">{staff.name}</p>
                    <p className="text-3xl font-bold text-primary-600 mt-2">
                      {staff.paidLeaveBalance}
                      <span className="text-lg ml-1">日</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Requests */}
            <div className="card mb-6">
              <h2 className="text-lg font-semibold text-secondary-800 mb-4 flex items-center gap-2">
                承認待ち申請
                {pendingRequests.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold rounded-full">
                    {pendingRequests.length}
                  </span>
                )}
              </h2>

              {pendingRequests.length === 0 ? (
                <p className="text-center text-secondary-500 py-4 text-sm">
                  承認待ちの申請はありません
                </p>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map(request => (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl"
                    >
                      <div>
                        <p className="font-medium text-secondary-800">{request.name}</p>
                        <p className="text-sm text-secondary-600 mt-0.5">
                          取得希望日: {formatDate(request.leaveDate)}
                        </p>
                        <p className="text-xs text-secondary-500">
                          申請日: {formatDate(request.requestDate)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(request.id)}
                          className="btn btn-success !py-2 !px-4 !text-sm"
                        >
                          <Check className="w-4 h-4" />
                          承認
                        </button>
                        <button
                          onClick={() => handleReject(request.id)}
                          className="btn btn-danger !py-2 !px-4 !text-sm"
                        >
                          <X className="w-4 h-4" />
                          却下
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Processed Requests */}
            <div className="card overflow-x-auto p-0 overflow-hidden">
              <div className="px-6 py-5">
                <h2 className="text-lg font-semibold text-secondary-800">
                  処理済み申請履歴
                </h2>
              </div>

              {processedRequests.length === 0 ? (
                <p className="text-center text-secondary-500 py-4 text-sm">
                  処理済みの申請はありません
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-secondary-800 to-secondary-900 text-white">
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider">
                        氏名
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider">
                        取得日
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider">
                        申請日
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider">
                        ステータス
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-secondary-100">
                    {processedRequests.map(request => (
                      <tr key={request.id} className="hover:bg-primary-50/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-secondary-800">
                          {request.name}
                        </td>
                        <td className="px-4 py-3 text-secondary-700">
                          {formatDate(request.leaveDate)}
                        </td>
                        <td className="px-4 py-3 text-secondary-700">
                          {formatDate(request.requestDate)}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(request.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
