import type { ApplicationStatus, SubmissionStatus, ShiftDiffKind } from '../../types';
import { APPLICATION_TYPE_LABEL } from '../../utils/shiftDiff';

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const map: Record<ApplicationStatus, { text: string; class: string }> = {
    pending: { text: '承認待ち', class: 'bg-amber-100 text-amber-700 border-amber-200' },
    approved: { text: '承認済み', class: 'bg-green-100 text-green-700 border-green-200' },
    rejected: { text: '却下', class: 'bg-red-100 text-red-700 border-red-200' },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${m.class}`}>
      {m.text}
    </span>
  );
}

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const map: Record<SubmissionStatus, { text: string; class: string }> = {
    draft: { text: '下書き', class: 'bg-secondary-100 text-secondary-600 border-secondary-200' },
    submitted: { text: '提出済み', class: 'bg-blue-100 text-blue-700 border-blue-200' },
    approved: { text: '確定', class: 'bg-green-100 text-green-700 border-green-200' },
    rejected: { text: '差戻し', class: 'bg-red-100 text-red-700 border-red-200' },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${m.class}`}>
      {m.text}
    </span>
  );
}

export function ShiftDiffKindBadge({ kind }: { kind: ShiftDiffKind }) {
  const colorMap: Record<ShiftDiffKind, string> = {
    late_arrival: 'bg-amber-100 text-amber-700 border-amber-200',
    early_leave: 'bg-orange-100 text-orange-700 border-orange-200',
    overtime: 'bg-amber-100 text-amber-700 border-amber-200',
    absence: 'bg-red-100 text-red-700 border-red-200',
    extra_work: 'bg-purple-100 text-purple-700 border-purple-200',
    shift_change: 'bg-blue-100 text-blue-700 border-blue-200',
    break_deviation: 'bg-pink-100 text-pink-700 border-pink-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorMap[kind]}`}>
      {APPLICATION_TYPE_LABEL[kind]}
    </span>
  );
}
