import type { ApplicationStatus, SubmissionStatus, ShiftDiffKind } from '../../types';
import { APPLICATION_TYPE_LABEL } from '../../utils/shiftDiff';

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const map: Record<ApplicationStatus, { text: string; class: string }> = {
    pending: { text: '承認待ち', class: 'pill-warning' },
    approved: { text: '承認済み', class: 'pill-success' },
    rejected: { text: '却下', class: 'pill-danger' },
  };
  const m = map[status];
  return <span className={`pill ${m.class}`}>{m.text}</span>;
}

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  const map: Record<SubmissionStatus, { text: string; class: string }> = {
    draft: { text: '下書き', class: 'pill-neutral' },
    submitted: { text: '提出済み', class: 'pill-info' },
    approved: { text: '確定', class: 'pill-success' },
    rejected: { text: '差戻し', class: 'pill-danger' },
  };
  const m = map[status];
  return <span className={`pill ${m.class}`}>{m.text}</span>;
}

export function ShiftDiffKindBadge({ kind }: { kind: ShiftDiffKind }) {
  const colorMap: Record<ShiftDiffKind, string> = {
    late_arrival: 'pill-warning',
    early_leave: 'pill-warning',
    overtime: 'pill-tint',
    absence: 'pill-danger',
    extra_work: 'pill-info',
    shift_change: 'pill-info',
    break_deviation: 'pill-neutral',
  };
  return <span className={`pill ${colorMap[kind]}`}>{APPLICATION_TYPE_LABEL[kind]}</span>;
}
