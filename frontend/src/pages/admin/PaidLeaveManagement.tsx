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
          <span className="flex items-center gap-1 text-yellow-700 bg-yellow-100 px-2 py-1 rounded text-sm">
            <Clock className="w-4 h-4" />
            申請中
          </span>
        );
      case 'approved':
        return (
          <span className="flex items-center gap-1 text-green-700 bg-green-100 px-2 py-1 rounded text-sm">
            <CheckCircle className="w-4 h-4" />
            承認済
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 text-red-700 bg-red-100 px-2 py-1 rounded text-sm">
            <X className="w-4 h-4" />
            却下
          </span>
        );
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="有給管理" />

      <main className="max-w-4xl mx-auto p-4">
        {/* Back Link */}
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 text-gray-600 hover:text-primary-600 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          ダッシュボードへ戻る
        </Link>

        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-lg mb-4 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <p>{message.text}</p>
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
              <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Palmtree className="w-5 h-5" />
                スタッフ別有給残日数
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {staffList.map(staff => (
                  <div
                    key={staff.staffId}
                    className="p-4 bg-gray-50 rounded-lg text-center"
                  >
                    <p className="font-medium text-gray-800">{staff.name}</p>
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
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                承認待ち申請
                {pendingRequests.length > 0 && (
                  <span className="ml-2 bg-yellow-500 text-white text-sm px-2 py-0.5 rounded-full">
                    {pendingRequests.length}
                  </span>
                )}
              </h2>

              {pendingRequests.length === 0 ? (
                <p className="text-center text-gray-500 py-4">
                  承認待ちの申請はありません
                </p>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map(request => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-800">{request.name}</p>
                        <p className="text-sm text-gray-600">
                          取得希望日: {formatDate(request.leaveDate)}
                        </p>
                        <p className="text-xs text-gray-500">
                          申請日: {formatDate(request.requestDate)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(request.id)}
                          className="btn btn-success py-1 px-3"
                        >
                          <Check className="w-4 h-4" />
                          承認
                        </button>
                        <button
                          onClick={() => handleReject(request.id)}
                          className="btn btn-danger py-1 px-3"
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
            <div className="card">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                処理済み申請履歴
              </h2>

              {processedRequests.length === 0 ? (
                <p className="text-center text-gray-500 py-4">
                  処理済みの申請はありません
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                          氏名
                        </th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                          取得日
                        </th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                          申請日
                        </th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">
                          ステータス
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {processedRequests.map(request => (
                        <tr key={request.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {request.name}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {formatDate(request.leaveDate)}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {formatDate(request.requestDate)}
                          </td>
                          <td className="px-4 py-3">{getStatusBadge(request.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
