import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { staffApi, adminApi } from '../../api';
import type { Staff, StaffInfo, AdminInfo } from '../../types';
import { Header, Loading, Modal, Spinner } from '../../components/common';
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

// ===== 見た目だけの部品（クラス名） =====
// 行の右端に並べるアイコンだけのボタン（押せる範囲は 44 × 44）
const ICON_BUTTON =
  'grid h-11 w-11 flex-shrink-0 place-items-center rounded-full transition-colors hover:bg-fill active:opacity-60';
// パスワード欄の右端に重ねる「表示 / 隠す」ボタン
const PASSWORD_TOGGLE =
  'absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-[10px] text-label-3 active:opacity-60';
// 入力欄の下の補足
const FIELD_HINT = 'mt-1.5 px-1 t-footnote text-label-2';

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
    <div className="page">
      <Header
        title="スタッフ"
        actions={
          <button
            type="button"
            onClick={() => handleOpenModal()}
            className="btn btn-plain min-w-11"
            aria-label="スタッフを追加"
          >
            <Plus className="!h-[22px] !w-[22px] sm:!h-[18px] sm:!w-[18px]" strokeWidth={2.2} aria-hidden="true" />
            <span className="hidden sm:inline">スタッフを追加</span>
          </button>
        }
      />

      <main className="page-content">
        {error && (
          <div className="callout callout-danger mt-2" role="alert">
            <AlertCircle aria-hidden="true" />
            <p className="font-medium break-words">{error}</p>
          </div>
        )}

        {/* スタッフ一覧 */}
        <section className="section">
          <h2 className="section-header">スタッフ一覧</h2>
          <div className="list-group">
            {isLoading ? (
              <div className="list-row justify-center py-5">
                <Loading message="読み込み中..." />
              </div>
            ) : staffList.length === 0 ? (
              <div className="list-row">
                <span className="t-body text-label-2">スタッフが登録されていません</span>
              </div>
            ) : (
              staffList.map(staff => (
                <div key={staff.staffId} className="list-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="t-body min-w-0 truncate">{staff.name}</span>
                      <span className={`pill flex-shrink-0 ${staff.status === 'active' ? 'pill-success' : 'pill-neutral'}`}>
                        {staff.status === 'active' ? '有効' : '無効'}
                      </span>
                      {/* 操作（見た目は 1 行目の高さに収め、押せる範囲は 44 × 44 のまま） */}
                      <div className="-my-2.5 -mr-3 ml-auto flex flex-shrink-0 items-center">
                        <button
                          type="button"
                          onClick={() => handleOpenPasswordReset(staff)}
                          className={`${ICON_BUTTON} text-tint`}
                          aria-label={`${staff.name}さんのパスワードをリセット`}
                          title="パスワードリセット"
                        >
                          <KeyRound className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenModal(staff)}
                          className={`${ICON_BUTTON} text-tint`}
                          aria-label={`${staff.name}さんを編集`}
                          title="編集"
                        >
                          <Pencil className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(staff)}
                          className={`${ICON_BUTTON} text-danger`}
                          aria-label={`${staff.name}さんを削除`}
                          title="削除"
                        >
                          <Trash2 className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <p className="t-footnote text-label-2 truncate">{staff.email || '-'}</p>
                    <p className="t-footnote text-label-2 tabular flex flex-wrap gap-x-3">
                      <span>月給 {formatCurrency(staff.monthlySalary)}</span>
                      <span>入社日 {staff.hireDate || '-'}</span>
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 管理者アカウント */}
        <section className="section">
          <h2 className="section-header">管理者アカウント</h2>

          {adminError && (
            <div className="callout callout-danger mb-3" role="alert">
              <AlertCircle aria-hidden="true" />
              <p className="font-medium break-words">{adminError}</p>
            </div>
          )}

          <div className="list-group">
            {isLoadingAdmins ? (
              <div className="list-row justify-center py-5">
                <Loading message="読み込み中..." />
              </div>
            ) : adminList.length === 0 ? (
              <div className="list-row">
                <span className="t-body text-label-2">管理者が登録されていません</span>
              </div>
            ) : (
              adminList.map(admin => (
                <div key={admin.adminId} className="list-row">
                  <div className="list-row-title">
                    <p className="t-body truncate">{admin.name}</p>
                    <p className="t-footnote text-label-2 truncate">{admin.email}</p>
                  </div>
                  <div className="-mr-3 flex flex-shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => handleOpenAdminModal(admin)}
                      className={`${ICON_BUTTON} text-tint`}
                      aria-label={`管理者「${admin.name}」を編集`}
                      title="編集"
                    >
                      <Pencil className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAdmin(admin)}
                      className={`${ICON_BUTTON} text-danger`}
                      aria-label={`管理者「${admin.name}」を削除`}
                      title="削除"
                    >
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))
            )}
            <button type="button" onClick={() => handleOpenAdminModal()} className="list-row text-tint">
              <Plus className="h-5 w-5 flex-shrink-0" strokeWidth={2.2} aria-hidden="true" />
              <span className="t-body">管理者を追加</span>
            </button>
          </div>
        </section>
      </main>

      {/* 完了のお知らせ（iPhone ではタブバーの上、PC では左側メニューを除いた中央に出す） */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-height)+var(--safe-bottom)+12px)] z-50 flex justify-center px-4 lg:bottom-6 lg:pl-[280px]"
        role="status"
        aria-live="polite"
      >
        {toast && (
          <div
            className="material-bar flex items-center gap-2 rounded-full px-4 py-2.5 animate-fade-in"
            style={{ boxShadow: 'var(--ios-shadow-raised), 0 0 0 0.5px var(--ios-separator)' }}
          >
            <CheckCircle2 className="h-[18px] w-[18px] flex-shrink-0 text-success" aria-hidden="true" />
            <span className="t-subhead font-medium">{toast}</span>
          </div>
        )}
      </div>

      {/* スタッフの登録・編集 */}
      <Modal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingStaff ? 'スタッフ編集' : '新規スタッフ登録'}
        size="lg"
      >
        <form onSubmit={handleStaffSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="staff-form-name" className="label">氏名 *</label>
              <input
                id="staff-form-name"
                type="text"
                name="name"
                value={staffForm.name}
                onChange={handleStaffInputChange}
                className="input"
                placeholder="山田 太郎"
              />
            </div>

            <div>
              <label htmlFor="staff-form-email" className="label">メールアドレス *</label>
              <input
                id="staff-form-email"
                type="email"
                name="email"
                value={staffForm.email}
                onChange={handleStaffInputChange}
                className="input"
                placeholder="staff@example.com"
                autoComplete="off"
              />
            </div>

            {!editingStaff && (
              <div>
                <label htmlFor="staff-form-password" className="label">初期パスワード *</label>
                <div className="relative">
                  <input
                    id="staff-form-password"
                    type={showStaffPassword ? 'text' : 'password'}
                    name="password"
                    value={staffForm.password}
                    onChange={handleStaffInputChange}
                    className="input pr-12"
                    placeholder="8文字以上"
                    autoComplete="new-password"
                    aria-describedby="staff-form-password-hint"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStaffPassword(s => !s)}
                    className={PASSWORD_TOGGLE}
                    aria-label={showStaffPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                  >
                    {showStaffPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
                <p id="staff-form-password-hint" className={FIELD_HINT}>8文字以上を推奨します</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label htmlFor="staff-form-salary" className="label">月給 *</label>
                <input
                  id="staff-form-salary"
                  type="number"
                  name="monthlySalary"
                  value={staffForm.monthlySalary}
                  onChange={handleStaffInputChange}
                  className="input tabular"
                  placeholder="250000"
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="staff-form-transportation" className="label">交通費（月額）</label>
                <input
                  id="staff-form-transportation"
                  type="number"
                  name="transportation"
                  value={staffForm.transportation}
                  onChange={handleStaffInputChange}
                  className="input tabular"
                  placeholder="15000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label htmlFor="staff-form-hire-date" className="label">入社日</label>
                <input
                  id="staff-form-hire-date"
                  type="date"
                  name="hireDate"
                  value={staffForm.hireDate}
                  onChange={handleStaffInputChange}
                  className="input"
                />
              </div>
              <div className="min-w-0">
                <label htmlFor="staff-form-birth-date" className="label">生年月日</label>
                <input
                  id="staff-form-birth-date"
                  type="date"
                  name="birthDate"
                  value={staffForm.birthDate}
                  onChange={handleStaffInputChange}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="staff-form-paid-leave" className="label">有給休暇残日数</label>
              <input
                id="staff-form-paid-leave"
                type="number"
                name="paidLeaveBalance"
                value={staffForm.paidLeaveBalance}
                onChange={handleStaffInputChange}
                className="input tabular"
                placeholder="10"
              />
            </div>

            {editingStaff && (
              <div className="border-t-[0.5px] border-separator pt-2">
                <button
                  type="button"
                  onClick={() => {
                    handleCloseModal();
                    handleOpenPasswordReset(editingStaff);
                  }}
                  className="btn btn-plain !px-1"
                >
                  <KeyRound aria-hidden="true" />
                  パスワードリセット
                </button>
              </div>
            )}

            {error && (
              <div className="callout callout-danger" role="alert">
                <AlertCircle aria-hidden="true" />
                <p className="font-medium break-words">{error}</p>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="button" onClick={handleCloseModal} className="btn btn-gray">
              キャンセル
            </button>
            <button type="submit" disabled={isSaving} className="btn btn-filled">
              {isSaving && <Spinner size={18} className="!text-current" />}
              {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>

      {/* パスワードリセット */}
      <Modal
        isOpen={showPasswordResetModal}
        onClose={handleClosePasswordReset}
        title="パスワードリセット"
        size="md"
      >
        <form onSubmit={handleSubmitPasswordReset}>
          <div className="space-y-4">
            {passwordResetTarget && (
              <div className="tile">
                <p className="t-subhead text-label-2">
                  対象スタッフ: <span className="font-semibold text-label">{passwordResetTarget.name}</span>
                </p>
                {passwordResetTarget.email && (
                  <p className="t-footnote text-label-2 mt-0.5 break-all">{passwordResetTarget.email}</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="staff-reset-password" className="label">新しいパスワード *</label>
              <div className="relative">
                <input
                  id="staff-reset-password"
                  type={showResetPassword ? 'text' : 'password'}
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  className="input pr-12"
                  placeholder="8文字以上"
                  autoComplete="new-password"
                  aria-describedby="staff-reset-password-hint"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(s => !s)}
                  className={PASSWORD_TOGGLE}
                  aria-label={showResetPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                >
                  {showResetPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
              <p id="staff-reset-password-hint" className={FIELD_HINT}>8文字以上を推奨します</p>
            </div>

            {resetError && (
              <div className="callout callout-danger" role="alert">
                <AlertCircle aria-hidden="true" />
                <p className="font-medium break-words">{resetError}</p>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="button" onClick={handleClosePasswordReset} className="btn btn-gray">
              キャンセル
            </button>
            <button type="submit" disabled={isResetting} className="btn btn-filled">
              {isResetting && <Spinner size={18} className="!text-current" />}
              {isResetting ? '更新中...' : 'パスワードを更新'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 管理者の登録・編集 */}
      <Modal
        isOpen={showAdminModal}
        onClose={handleCloseAdminModal}
        title={editingAdmin ? '管理者編集' : '新規管理者登録'}
        size="md"
      >
        <form onSubmit={handleAdminSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="admin-form-name" className="label">氏名 *</label>
              <input
                id="admin-form-name"
                type="text"
                name="name"
                value={adminForm.name}
                onChange={handleAdminInputChange}
                className="input"
                placeholder="管理 太郎"
              />
            </div>

            <div>
              <label htmlFor="admin-form-email" className="label">メールアドレス *</label>
              <input
                id="admin-form-email"
                type="email"
                name="email"
                value={adminForm.email}
                onChange={handleAdminInputChange}
                className="input"
                placeholder="admin@example.com"
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="admin-form-password" className="label">
                {editingAdmin ? 'パスワード（変更する場合のみ）' : '初期パスワード *'}
              </label>
              <div className="relative">
                <input
                  id="admin-form-password"
                  type={showAdminPassword ? 'text' : 'password'}
                  name="password"
                  value={adminForm.password}
                  onChange={handleAdminInputChange}
                  className="input pr-12"
                  placeholder={editingAdmin ? '変更する場合のみ入力' : '8文字以上'}
                  autoComplete="new-password"
                  aria-describedby="admin-form-password-hint"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(s => !s)}
                  className={PASSWORD_TOGGLE}
                  aria-label={showAdminPassword ? 'パスワードを隠す' : 'パスワードを表示'}
                >
                  {showAdminPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
              <p id="admin-form-password-hint" className={FIELD_HINT}>8文字以上を推奨します</p>
            </div>

            {adminError && (
              <div className="callout callout-danger" role="alert">
                <AlertCircle aria-hidden="true" />
                <p className="font-medium break-words">{adminError}</p>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button type="button" onClick={handleCloseAdminModal} className="btn btn-gray">
              キャンセル
            </button>
            <button type="submit" disabled={isSavingAdmin} className="btn btn-filled">
              {isSavingAdmin && <Spinner size={18} className="!text-current" />}
              {isSavingAdmin ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
