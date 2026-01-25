import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  User,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi } from '../../api';
import type { Staff, StaffInfo } from '../../types';
import { Header, Loading, Modal } from '../../components/common';
import { formatCurrency } from '../../utils/calculations';

export function StaffManagement() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuth();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    pinCode: '',
    monthlySalary: '',
    transportation: '',
    hireDate: '',
    birthDate: '',
    paidLeaveBalance: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Redirect if not admin
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Fetch staff list
  useEffect(() => {
    fetchStaffList();
  }, []);

  const fetchStaffList = async () => {
    try {
      const response = await staffApi.getList();
      if (response.success && response.data) {
        // Fetch details for each staff
        const detailedStaff = await Promise.all(
          response.data.map(async (s: StaffInfo) => {
            const detailRes = await staffApi.getDetails(s.staffId);
            return detailRes.data || s;
          })
        );
        setStaffList(detailedStaff as Staff[]);
      }
    } catch {
      setError('スタッフ情報の取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (staff?: Staff) => {
    if (staff) {
      setEditingStaff(staff);
      setFormData({
        name: staff.name,
        pinCode: '', // Don't show existing PIN
        monthlySalary: staff.monthlySalary.toString(),
        transportation: staff.transportation.toString(),
        hireDate: staff.hireDate,
        birthDate: staff.birthDate,
        paidLeaveBalance: staff.paidLeaveBalance.toString(),
      });
    } else {
      setEditingStaff(null);
      setFormData({
        name: '',
        pinCode: '',
        monthlySalary: '',
        transportation: '',
        hireDate: '',
        birthDate: '',
        paidLeaveBalance: '0',
      });
    }
    setError('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingStaff(null);
    setError('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('氏名を入力してください');
      return;
    }
    if (!editingStaff && (!formData.pinCode || formData.pinCode.length !== 4)) {
      setError('4桁のPINコードを入力してください');
      return;
    }
    if (!formData.monthlySalary || isNaN(Number(formData.monthlySalary))) {
      setError('月給を正しく入力してください');
      return;
    }

    setIsSaving(true);

    try {
      const staffData = {
        name: formData.name.trim(),
        pinCode: formData.pinCode || undefined,
        monthlySalary: Number(formData.monthlySalary),
        transportation: Number(formData.transportation) || 0,
        hireDate: formData.hireDate,
        birthDate: formData.birthDate,
        paidLeaveBalance: Number(formData.paidLeaveBalance) || 0,
        status: 'active' as const,
      };

      if (editingStaff) {
        await staffApi.update(editingStaff.staffId, staffData);
      } else {
        await staffApi.create(staffData);
      }

      handleCloseModal();
      await fetchStaffList();
    } catch {
      setError('保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (staff: Staff) => {
    if (!confirm(`${staff.name}さんを削除してもよろしいですか？`)) {
      return;
    }

    try {
      await staffApi.delete(staff.staffId);
      await fetchStaffList();
    } catch {
      setError('削除に失敗しました');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="スタッフ管理" />

      <main className="max-w-4xl mx-auto p-4">
        {/* Back Link */}
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 text-gray-600 hover:text-primary-600 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          ダッシュボードへ戻る
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">スタッフ一覧</h2>
          <button
            onClick={() => handleOpenModal()}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5" />
            新規登録
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg mb-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Staff List */}
        {isLoading ? (
          <div className="card">
            <Loading message="読み込み中..." />
          </div>
        ) : staffList.length === 0 ? (
          <div className="card text-center py-8">
            <User className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500">スタッフが登録されていません</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                    氏名
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden sm:table-cell">
                    月給
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">
                    入社日
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">
                    有給残
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {staffList.map(staff => (
                  <tr key={staff.staffId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-800">{staff.name}</p>
                        <p className="text-xs text-gray-500 sm:hidden">
                          {formatCurrency(staff.monthlySalary)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 hidden sm:table-cell">
                      {formatCurrency(staff.monthlySalary)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 hidden md:table-cell">
                      {staff.hireDate}
                    </td>
                    <td className="px-4 py-3 text-gray-700 hidden md:table-cell">
                      {staff.paidLeaveBalance}日
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(staff)}
                          className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(staff)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingStaff ? 'スタッフ編集' : '新規スタッフ登録'}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="label">氏名 *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="input"
                placeholder="山田 太郎"
              />
            </div>

            <div>
              <label className="label">
                PINコード（4桁）{!editingStaff && '*'}
              </label>
              <input
                type="text"
                name="pinCode"
                value={formData.pinCode}
                onChange={handleInputChange}
                className="input"
                placeholder={editingStaff ? '変更する場合のみ入力' : '1234'}
                maxLength={4}
                pattern="[0-9]*"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">月給 *</label>
                <input
                  type="number"
                  name="monthlySalary"
                  value={formData.monthlySalary}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="250000"
                />
              </div>
              <div>
                <label className="label">交通費（月額）</label>
                <input
                  type="number"
                  name="transportation"
                  value={formData.transportation}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="15000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">入社日</label>
                <input
                  type="date"
                  name="hireDate"
                  value={formData.hireDate}
                  onChange={handleInputChange}
                  className="input"
                />
              </div>
              <div>
                <label className="label">生年月日</label>
                <input
                  type="date"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleInputChange}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="label">有給休暇残日数</label>
              <input
                type="number"
                name="paidLeaveBalance"
                value={formData.paidLeaveBalance}
                onChange={handleInputChange}
                className="input"
                placeholder="10"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={handleCloseModal}
              className="btn btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn btn-primary flex-1"
            >
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
