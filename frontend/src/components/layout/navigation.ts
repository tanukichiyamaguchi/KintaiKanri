import type { LucideIcon } from 'lucide-react';
import {
  Clock3,
  CalendarDays,
  FileText,
  CalendarHeart,
  CircleUserRound,
  LayoutGrid,
  CircleCheckBig,
  ClipboardList,
  UsersRound,
  Ellipsis,
  ClipboardPen,
  Palmtree,
  Calculator,
  Settings,
} from 'lucide-react';

export type BadgeKey = 'approvals' | 'shiftRequests' | 'paidLeave' | 'more';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** 色付き角丸アイコンの背景色（Tailwind のクラス） */
  iconBg: string;
  /** 件数バッジ */
  badge?: BadgeKey;
  /** このパスで始まるページも「選択中」とみなす */
  matchPrefix?: string[];
  /** 完全一致のときだけ選択中とみなす */
  exact?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

// ---- スタッフ ----
export const STAFF_TABS: NavItem[] = [
  { to: '/clock', label: '打刻', icon: Clock3, iconBg: 'bg-icon-gold' },
  { to: '/attendance', label: '出勤簿', icon: CalendarDays, iconBg: 'bg-icon-blue' },
  { to: '/applications', label: '申請', icon: FileText, iconBg: 'bg-icon-orange' },
  { to: '/shift-request', label: '希望休', icon: CalendarHeart, iconBg: 'bg-icon-pink' },
  { to: '/mypage', label: 'マイページ', icon: CircleUserRound, iconBg: 'bg-icon-gray' },
];

export const STAFF_SIDEBAR: NavSection[] = [{ items: STAFF_TABS }];

// ---- 管理者 ----
const ADMIN_HOME: NavItem = { to: '/admin', label: 'ホーム', icon: LayoutGrid, iconBg: 'bg-icon-gold', exact: true };
const ADMIN_APPROVALS: NavItem = { to: '/admin/approvals', label: '承認', icon: CircleCheckBig, iconBg: 'bg-icon-green', badge: 'approvals' };
const ADMIN_ATTENDANCE: NavItem = { to: '/admin/attendance', label: '勤怠', icon: ClipboardList, iconBg: 'bg-icon-blue', exact: true };
const ADMIN_STAFF: NavItem = { to: '/admin/staff', label: 'スタッフ', icon: UsersRound, iconBg: 'bg-icon-indigo' };
const ADMIN_ATTENDANCE_EDIT: NavItem = { to: '/admin/attendance/edit', label: '出勤簿の編集', icon: ClipboardPen, iconBg: 'bg-icon-teal' };
const ADMIN_SHIFT_REQUESTS: NavItem = { to: '/admin/shift-requests', label: '希望シフト', icon: CalendarHeart, iconBg: 'bg-icon-pink', badge: 'shiftRequests' };
const ADMIN_PAID_LEAVE: NavItem = { to: '/admin/paid-leave', label: '有給休暇', icon: Palmtree, iconBg: 'bg-icon-green', badge: 'paidLeave' };
const ADMIN_SALARY: NavItem = { to: '/admin/salary', label: '給与計算', icon: Calculator, iconBg: 'bg-icon-purple' };
const ADMIN_SETTINGS: NavItem = { to: '/admin/settings', label: 'システム設定', icon: Settings, iconBg: 'bg-icon-gray' };

/** iPhone の下部タブ（5 つまで。残りは「その他」にまとめる） */
export const ADMIN_TABS: NavItem[] = [
  ADMIN_HOME,
  ADMIN_APPROVALS,
  ADMIN_ATTENDANCE,
  ADMIN_STAFF,
  {
    to: '/admin/more',
    label: 'その他',
    icon: Ellipsis,
    iconBg: 'bg-icon-gray',
    badge: 'more',
    matchPrefix: ['/admin/attendance/edit', '/admin/shift-requests', '/admin/paid-leave', '/admin/salary', '/admin/settings'],
  },
];

/** 「その他」タブの中身 */
export const ADMIN_MORE_SECTIONS: NavSection[] = [
  { title: '勤怠', items: [ADMIN_ATTENDANCE_EDIT, ADMIN_SHIFT_REQUESTS, ADMIN_PAID_LEAVE] },
  { title: '給与・設定', items: [ADMIN_SALARY, ADMIN_SETTINGS] },
];

/** PC・iPad の左側メニュー */
export const ADMIN_SIDEBAR: NavSection[] = [
  { items: [ADMIN_HOME] },
  { title: '承認・申請', items: [ADMIN_APPROVALS, ADMIN_SHIFT_REQUESTS, ADMIN_PAID_LEAVE] },
  { title: '勤怠', items: [ADMIN_ATTENDANCE, ADMIN_ATTENDANCE_EDIT] },
  { title: 'スタッフ・給与', items: [ADMIN_STAFF, ADMIN_SALARY] },
  { title: '設定', items: [ADMIN_SETTINGS] },
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.to;
  if (pathname === item.to || pathname.startsWith(item.to + '/')) {
    // 「勤怠」タブ（/admin/attendance）は「出勤簿の編集」（/admin/attendance/edit）を含めない
    return !(item.to === '/admin/attendance' && pathname.startsWith('/admin/attendance/edit'));
  }
  return (item.matchPrefix || []).some(p => pathname === p || pathname.startsWith(p + '/'));
}
