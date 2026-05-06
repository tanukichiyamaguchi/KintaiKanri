import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  User,
  AlertCircle,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Key,
  Shield,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi, adminApi } from '../../api';
import type { Staff, StaffInfo, AdminInfo } from '../../types';
import { Header, Loading, Modal } from '../../components/common';
import { formatCurrency } from '../../utils/calculations';

type StaffFormData = {
  name: string;
  email: string;
  password: string;
  monthlySalary: string;
  transportation: string;
  hireDate: string;
  birthDate: string;
  paidLeaveBalance: string;
};

type AdminFormData = {
  name: string;
  email: string;
  password: string;
};

const emptyStaffForm: StaffFormData = {
  name: '',
  email: '',
  password: '',
  monthlySalary: '',
  transportation: '',
  hireDate: '',
  birthDate: '',
  paidLeaveBalance: '0',
};

const emptyAdminForm: AdminFormData = {
  name: '',
  email: '',
  password: '',
};

export function StaffManagement() {
  const navigate = useNavigate();
  const { isAdmin, isAuthenticated } = useAuth();

  // ===== Staff state =====
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffForm, setStaffForm] = useState<StaffFormData>(emptyStaffForm);
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Password reset modal
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [passwordResetTarget, setPasswordResetTarget] = useState<Staff | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Toast
  const [toast, setToast] = useState('');

  // ===== Admin state =====
  const [adminList, setAdminList] = useState<AdminInfo[]>([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(true);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminInfo | null>(null);
  const [adminForm, setAdminForm] = useState<AdminFormData>(emptyAdminForm);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);
  const [adminError, setAdminError] = useState('');

  // Redirect if not admin
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      navigate('/');
    }
  }, [isAuthenticated, isAdmin, navigate]);

  // Fetch staff and admins
  useEffect(() => {
    fetchStaffList();
    fetchAdminList();
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  // ===== Staff handlers =====
  const fetchStaffList = async () => {
    setIsLoading(true);
    try {
      const response = await staffApi.getList();
      if (response.success && response.data) {
        const detailedStaff = await Promise.all(
          response.data.map(async (s: StaffInfo) => {
            const detailRes = await staffApi.getDetails(s.staffId);
            return detailRes.data || (s as unknown as Staff);
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
      setStaffForm({
        name: staff.name,
        email: staff.email || '',
        password: '',
        monthlySalary: staff.monthlySalary.toString(),
        transportation: staff.transportation.toString(),
        hireDate: staff.hireDate,
        birthDate: staff.birthDate,
        paidLeaveBalance: staff.paidLeaveBalance.toString(),
      });
    } else {
      setEditingStaff(null);
      setStaffForm(emptyStaffForm);
    }
    setShowStaffPassword(false);
    setError('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingStaff(null);
    setError('');
    setShowStaffPassword(false);
  };

  const handleStaffInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setStaffForm(prev => ({ ...prev, [name]: value }));
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!staffForm.name.trim()) {
      setError('氏名を入力してください');
      return;
    }
    if (!staffForm.email.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }
    if (!editingStaff && !staffForm.password) {
      setError('初期パスワードを入力してください');
      return;
    }
    if (!editingStaff && staffForm.password.length < 8) {
      setError('パスワードは8文字以上で設定してください');
      return;
    }
    if (!staffForm.monthlySalary || isNaN(Number(staffForm.monthlySalary))) {
      setError('月給を正しく入力してください');
      return;
    }

    setIsSaving(true);

    try {
      if (editingStaff) {
        const updateData: Partial<Staff> & { password?: string } = {
          name: staffForm.name.trim(),
          email: staffForm.email.trim(),
          monthlySalary: Number(staffForm.monthlySalary),
          transportation: Number(staffForm.transportation) || 0,
          hireDate: staffForm.hireDate,
          birthDate: staffForm.birthDate,
          paidLeaveBalance: Number(staffForm.paidLeaveBalance) || 0,
        };
        if (staffForm.password) {
          updateData.password = staffForm.password;
        }
        const res = await staffApi.update(editingStaff.staffId, updateData);
        if (!res.success) {
          setError(res.error || '保存に失敗しました');
          setIsSaving(false);
          return;
        }
        setToast('スタッフ情報を更新しました');
      } else {
        const createData = {
          email: staffForm.email.trim(),
          password: staffForm.password,
          name: staffForm.name.trim(),
          monthlySalary: Number(staffForm.monthlySalary),
          transportation: Number(staffForm.transportation) || 0,
          hireDate: staffForm.hireDate,
          birthDate: staffForm.birthDate,
          paidLeaveBalance: Number(staffForm.paidLeaveBalance) || 0,
          status: 'active' as const,
        };
        const res = await staffApi.create(createData as unknown as Omit<Staff, 'staffId'>);
        if (!res.success) {
          setError(res.error || '保存に失敗しました');
          setIsSaving(false);
          return;
        }
        setToast('スタッフを登録しました');
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
      const res = await staffApi.delete(staff.staffId);
      if (!res.success) {
        setError(res.error || '削除に失敗しました');
        return;
      }
      setToast('スタッフを削除しました');
      await fetchStaffList();
    } catch {
      setError('削除に失敗しました');
    }
  };

  // ===== Password reset =====
  const handleOpenPasswordReset = (staff: Staff) => {
    setPasswordResetTarget(staff);
    setResetPassword('');
    setResetError('');
    setShowResetPassword(false);
    setShowPasswordResetModal(true);
  };

  const handleClosePasswordReset = () => {
    setShowPasswordResetModal(false);
    setPasswordResetTarget(null);
    setResetPassword('');
    setResetError('');
    setShowResetPassword(false);
  };

  const handleSubmitPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (!passwordResetTarget) return;
    if (!resetPassword) {
      setResetError('新しいパスワードを入力してください');
      return;
    }
    if (resetPassword.length < 8) {
      setResetError('パスワードは8文字以上で設定してください');
      return;
    }

    setIsResetting(true);
    try {
      const res = await staffApi.update(passwordResetTarget.staffId, {
        password: resetPassword,
      } as Partial<Staff> & { password?: string });
      if (!res.success) {
        setResetError(res.error || 'パスワードの更新に失敗しました');
        setIsResetting(false);
        return;
      }
      setToast('パスワードを更新しました');
      handleClosePasswordReset();
    } catch {
      setResetError('パスワードの更新に失敗しました');
    } finally {
      setIsResetting(false);
    }
  };

  // ===== Admin handlers =====
  const fetchAdminList = async () => {
    setIsLoadingAdmins(true);
    try {
      const response = await adminApi.list();
      if (response.success && response.data) {
        setAdminList(response.data);
      }
    } catch {
      setAdminError('管理者情報の取得に失敗しました');
    } finally {
      setIsLoadingAdmins(false);
    }
  };

  const handleOpenAdminModal = (admin?: AdminInfo) => {
    if (admin) {
      setEditingAdmin(admin);
      setAdminForm({
        name: admin.name,
        email: admin.email,
        password: '',
      });
    } else {
      setEditingAdmin(null);
      setAdminForm(emptyAdminForm);
    }
    setShowAdminPassword(false);
    setAdminError('');
    setShowAdminModal(true);
  };

  const handleCloseAdminModal = () => {
    setShowAdminModal(false);
    setEditingAdmin(null);
    setAdminError('');
    setShowAdminPassword(false);
  };

  const handleAdminInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAdminForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    if (!adminForm.name.trim()) {
      setAdminError('氏名を入力してください');
      return;
    }
    if (!adminForm.email.trim()) {
      setAdminError('メールアドレスを入力してください');
      return;
    }
    if (!editingAdmin && !adminForm.password) {
      setAdminError('初期パスワードを入力してください');
      return;
    }
    if (!editingAdmin && adminForm.password.length < 8) {
      setAdminError('パスワードは8文字以上で設定してください');
      return;
    }
    if (editingAdmin && adminForm.password && adminForm.password.length < 8) {
      setAdminError('パスワードは8文字以上で設定してください');
      return;
    }

    setIsSavingAdmin(true);

    try {
      if (editingAdmin) {
        const updatePayload: {
          adminId: string;
          name?: string;
          email?: string;
          password?: string;
        } = {
          adminId: editingAdmin.adminId,
          name: adminForm.name.trim(),
          email: adminForm.email.trim(),
        };
        if (adminForm.password) {
          updatePayload.password = adminForm.password;
        }
        const res = await adminApi.update(updatePayload);
        if (!res.success) {
          setAdminError(res.error || '保存に失敗しました');
          setIsSavingAdmin(false);
          return;
        }
        setToast('管理者情報を更新しました');
      } else {
        const res = await adminApi.create({
          name: adminForm.name.trim(),
          email: adminForm.email.trim(),
          password: adminForm.password,
        });
        if (!res.success) {
          setAdminError(res.error || '保存に失敗しました');
          setIsSavingAdmin(false);
          return;
        }
        setToast('管理者を追加しました');
      }
      handleCloseAdminModal();
      await fetchAdminList();
    } catch {
      setAdminError('保存に失敗しました');
    } finally {
      setIsSavingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (admin: AdminInfo) => {
    if (!confirm(`管理者「${admin.name}」を削除してもよろしいですか？`)) {
      return;
    }
    try {
      const res = await adminApi.delete(admin.adminId);
      if (!res.success) {
        setAdminError(res.error || '削除に失敗しました');
        return;
      }
      setToast('管理者を削除しました');
      await fetchAdminList();
    } catch {
      setAdminError('削除に失敗しました');
    }
  };

  // ===== Render =====
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

        {/* Staff Section Header */}
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
          <div className="card overflow-hidden p-0">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                    氏名
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden sm:table-cell">
                    メール
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">
                    月給
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden lg:table-cell">
                    入社日
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden md:table-cell">
                    ステータス
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
                        <p className="text-xs text-gray-500 sm:hidden flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3" />
                          {staff.email || '-'}
                        </p>
                        <p className="text-xs text-gray-500 md:hidden mt-0.5">
                          {formatCurrency(staff.monthlySalary)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        {staff.email || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 hidden md:table-cell">
                      {formatCurrency(staff.monthlySalary)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 hidden lg:table-cell">
                      {staff.hireDate || '-'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span
                        className={`status-badge ${
                          staff.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        } inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium`}
                      >
                        {staff.status === 'active' ? '有効' : '無効'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenPasswordReset(staff)}
                          className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          aria-label="パスワードリセット"
                          title="パスワードリセット"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenModal(staff)}
                          className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          aria-label="編集"
                          title="編集"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(staff)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          aria-label="削除"
                          title="削除"
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

        {/* ===== Admin Section ===== */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-gray-700" />
              <h2 className="text-xl font-semibold text-gray-800">管理者アカウント</h2>
            </div>
            <button
              onClick={() => handleOpenAdminModal()}
              className="btn btn-primary"
            >
              <Plus className="w-5 h-5" />
              管理者を追加
            </button>
          </div>

          {adminError && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg mb-4">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{adminError}</p>
            </div>
          )}

          {isLoadingAdmins ? (
            <div className="card">
              <Loading message="読み込み中..." />
            </div>
          ) : adminList.length === 0 ? (
            <div className="card text-center py-8">
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">管理者が登録されていません</p>
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                      氏名
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 hidden sm:table-cell">
                      メール
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {adminList.map(admin => (
                    <tr key={admin.adminId} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-800">{admin.name}</p>
                          <p className="text-xs text-gray-500 sm:hidden flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3" />
                            {admin.email}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <Mail className="w-3.5 h-3.5 text-gray-400" />
                          {admin.email}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenAdminModal(admin)}
                            className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            aria-label="編集"
                            title="編集"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteAdmin(admin)}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            aria-label="削除"
                            title="削除"
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
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-lg shadow-lg">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium">{toast}</span>
          </div>
        </div>
      )}

      {/* Staff Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingStaff ? 'スタッフ編集' : '新規スタッフ登録'}
        size="lg"
      >
        <form onSubmit={handleStaffSubmit}>
          <div className="space-y-4">
            <div>
              <label className="label">氏名 *</label>
              <input
                type="text"
                name="name"
                value={staffForm.name}
                onChange={handleStaffInputChange}
                className="input"
                placeholder="山田 太郎"
              />
            </div>

            <div>
              <label className="label">メールアドレス *</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  name="email"
                  value={staffForm.email}
                  onChange={handleStaffInputChange}
                  className="input pl-10"
                  placeholder="staff@example.com"
                  autoComplete="off"
                />
              </div>
            </div>

            {!editingStaff && (
              <div>
                <label className="label">初期パスワード *</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type={showStaffPassword ? 'text' : 'password'}
                    name="password"
                    value={staffForm.password}
                    onChange={handleStaffInputChange}
                    className="input pl-10 pr-10"
                    placeholder="8文字以上"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStaffPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-primary-600 transition-colors"
                    aria-label={showStaffPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  >
                    {showStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">8文字以上を推奨します</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">月給 *</label>
                <input
                  type="number"
                  name="monthlySalary"
                  value={staffForm.monthlySalary}
                  onChange={handleStaffInputChange}
                  className="input"
                  placeholder="250000"
                />
              </div>
              <div>
                <label className="label">交通費（月額）</label>
                <input
                  type="number"
                  name="transportation"
                  value={staffForm.transportation}
                  onChange={handleStaffInputChange}
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
                  value={staffForm.hireDate}
                  onChange={handleStaffInputChange}
                  className="input"
                />
              </div>
              <div>
                <label className="label">生年月日</label>
                <input
                  type="date"
                  name="birthDate"
                  value={staffForm.birthDate}
                  onChange={handleStaffInputChange}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="label">有給休暇残日数</label>
              <input
                type="number"
                name="paidLeaveBalance"
                value={staffForm.paidLeaveBalance}
                onChange={handleStaffInputChange}
                className="input"
                placeholder="10"
              />
            </div>

            {editingStaff && (
              <div className="border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    handleCloseModal();
                    handleOpenPasswordReset(editingStaff);
                  }}
                  className="inline-flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  <Key className="w-4 h-4" />
                  パスワードリセット
                </button>
              </div>
            )}

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

      {/* Password Reset Modal */}
      <Modal
        isOpen={showPasswordResetModal}
        onClose={handleClosePasswordReset}
        title="パスワードリセット"
        size="md"
      >
        <form onSubmit={handleSubmitPasswordReset}>
          <div className="space-y-4">
            {passwordResetTarget && (
              <div className="text-sm text-gray-600 bg-gray-50 px-4 py-3 rounded-lg">
                <p>
                  対象スタッフ: <span className="font-medium text-gray-800">{passwordResetTarget.name}</span>
                </p>
                {passwordResetTarget.email && (
                  <p className="text-xs text-gray-500 mt-0.5">{passwordResetTarget.email}</p>
                )}
              </div>
            )}

            <div>
              <label className="label">新しいパスワード *</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  className="input pl-10 pr-10"
                  placeholder="8文字以上"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-primary-600 transition-colors"
                  aria-label={showResetPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">8文字以上を推奨します</p>
            </div>

            {resetError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{resetError}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={handleClosePasswordReset}
              className="btn btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isResetting}
              className="btn btn-primary flex-1"
            >
              {isResetting ? '更新中...' : 'パスワードを更新'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Admin Add/Edit Modal */}
      <Modal
        isOpen={showAdminModal}
        onClose={handleCloseAdminModal}
        title={editingAdmin ? '管理者編集' : '新規管理者登録'}
        size="md"
      >
        <form onSubmit={handleAdminSubmit}>
          <div className="space-y-4">
            <div>
              <label className="label">氏名 *</label>
              <input
                type="text"
                name="name"
                value={adminForm.name}
                onChange={handleAdminInputChange}
                className="input"
                placeholder="管理 太郎"
              />
            </div>

            <div>
              <label className="label">メールアドレス *</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  name="email"
                  value={adminForm.email}
                  onChange={handleAdminInputChange}
                  className="input pl-10"
                  placeholder="admin@example.com"
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label className="label">
                {editingAdmin ? 'パスワード（変更する場合のみ）' : '初期パスワード *'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  name="password"
                  value={adminForm.password}
                  onChange={handleAdminInputChange}
                  className="input pl-10 pr-10"
                  placeholder={editingAdmin ? '変更する場合のみ入力' : '8文字以上'}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-primary-600 transition-colors"
                  aria-label={showAdminPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                >
                  {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">8文字以上を推奨します</p>
            </div>

            {adminError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{adminError}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={handleCloseAdminModal}
              className="btn btn-secondary flex-1"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSavingAdmin}
              className="btn btn-primary flex-1"
            >
              {isSavingAdmin ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
