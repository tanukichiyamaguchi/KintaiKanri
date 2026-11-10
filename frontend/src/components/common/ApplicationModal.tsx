import { useState, useEffect, useMemo } from 'react';
import { Send, AlertTriangle, AlertCircle, Calendar, Check } from 'lucide-react';
import { Modal } from './Modal';
import { Spinner } from './Loading';
import { ShiftDiffKindBadge } from './StatusBadge';
import type { ApplicationType, ShiftDiff, ShiftDiffKind } from '../../types';
import { APPLICATION_TYPE_LABEL } from '../../utils/shiftDiff';

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  diff: ShiftDiff | null;
  preselectedType?: ApplicationType;
  onSubmit: (params: {
    type: ApplicationType;
    reason: string;
    details: ShiftDiff['details'];
  }) => Promise<void>;
}

export function ApplicationModal({
  isOpen,
  onClose,
  date,
  diff,
  preselectedType,
  onSubmit,
}: ApplicationModalProps) {
  const availableKinds = useMemo<ShiftDiffKind[]>(
    () => (diff?.kinds && diff.kinds.length > 0 ? diff.kinds : []),
    [diff]
  );
  const [selectedType, setSelectedType] = useState<ApplicationType | null>(
    preselectedType || availableKinds[0] || null
  );
  const [reason, setReason] = useState('');
  const [reasonType, setReasonType] = useState<'company' | 'personal'>('personal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsReasonType = selectedType === 'late_arrival' || selectedType === 'early_leave';

  useEffect(() => {
    if (isOpen) {
      setSelectedType(preselectedType || availableKinds[0] || null);
      setReason('');
      setReasonType('personal');
      setError(null);
    }
  }, [isOpen, preselectedType, availableKinds]);

  const handleSubmit = async () => {
    if (!selectedType) {
      setError('申請種別を選択してください');
      return;
    }
    if (!reason.trim()) {
      setError('理由は必須です');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const baseDetails = diff?.details || {};
      const details = needsReasonType
        ? { ...baseDetails, reasonType }
        : baseDetails;
      await onSubmit({
        type: selectedType,
        reason: reason.trim(),
        details,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '申請に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="勤怠申請" size="md">
      <div className="space-y-5 pb-1">
        {/* 対象日 */}
        <div className="flex items-center gap-3">
          <span className="row-icon bg-icon-blue">
            <Calendar aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="t-caption text-label-2">対象日</p>
            <p className="t-headline tabular">{date}</p>
          </div>
        </div>

        {/* 差異サマリ */}
        {diff && diff.hasIssue && (
          <div className="callout callout-warning">
            <AlertTriangle aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">シフトとの差異</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {diff.kinds.map(kind => (
                  <ShiftDiffKindBadge key={kind} kind={kind} />
                ))}
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-0.5 border-t-[0.5px] border-separator pt-2 t-footnote text-label-2 tabular sm:grid-cols-2">
                {diff.details.plannedStart && diff.details.plannedEnd && (
                  <div>
                    予定: {diff.details.plannedStart} - {diff.details.plannedEnd}
                  </div>
                )}
                {diff.details.actualStart && diff.details.actualEnd && (
                  <div>
                    実績: {diff.details.actualStart} - {diff.details.actualEnd}
                  </div>
                )}
                {diff.details.overtimeMinutes !== undefined && diff.details.overtimeMinutes > 0 && (
                  <div>残業: {diff.details.overtimeMinutes}分</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 種別選択 */}
        <div>
          <p className="label">
            申請種別 <span className="text-danger">*</span>
          </p>
          {availableKinds.length > 0 ? (
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="申請種別">
              {availableKinds.map(kind => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setSelectedType(kind)}
                  aria-pressed={selectedType === kind}
                  className={`flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 t-subhead font-medium transition-colors ${
                    selectedType === kind
                      ? 'bg-tint-fill text-tint ring-[1.5px] ring-inset ring-tint'
                      : 'bg-fill text-label hover:bg-fill-2'
                  }`}
                >
                  {selectedType === kind && <Check className="h-4 w-4 flex-shrink-0" strokeWidth={2.6} aria-hidden="true" />}
                  {APPLICATION_TYPE_LABEL[kind]}
                </button>
              ))}
            </div>
          ) : (
            <select
              value={selectedType || ''}
              onChange={e => setSelectedType(e.target.value as ApplicationType)}
              className="input"
              aria-label="申請種別"
            >
              <option value="">選択してください</option>
              {(Object.keys(APPLICATION_TYPE_LABEL) as ShiftDiffKind[]).map(k => (
                <option key={k} value={k}>{APPLICATION_TYPE_LABEL[k]}</option>
              ))}
            </select>
          )}
        </div>

        {/* 会社都合 / 個人都合 (遅刻・早退の場合のみ) */}
        {needsReasonType && (
          <div>
            <p className="label">
              理由区分 <span className="text-danger">*</span>
            </p>
            <div className="segmented" role="group" aria-label="理由区分">
              <button
                type="button"
                onClick={() => setReasonType('company')}
                aria-pressed={reasonType === 'company'}
                className="segmented-item min-h-11 text-[15px]"
              >
                会社都合
              </button>
              <button
                type="button"
                onClick={() => setReasonType('personal')}
                aria-pressed={reasonType === 'personal'}
                className="segmented-item min-h-11 text-[15px]"
              >
                個人都合
              </button>
            </div>
            <p className="mt-1.5 px-1 t-footnote text-label-2">
              {reasonType === 'company'
                ? '会社都合のため給与控除は行われません。'
                : '個人都合のため通常通り給与控除されます。'}
            </p>
          </div>
        )}

        {/* 理由 */}
        <div>
          <label className="block">
            <span className="label">
              理由 <span className="text-danger">*</span>
            </span>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="申請理由を入力してください"
              className="input"
              rows={4}
              required
            />
          </label>
          <p className="mt-1.5 px-1 t-footnote text-label-2">承認者（管理者）に届く理由欄です。具体的に記載してください。</p>
        </div>

        {/* Error */}
        {error && (
          <div className="callout callout-danger" role="alert">
            <AlertCircle aria-hidden="true" />
            <p className="font-medium break-words">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn btn-gray"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedType || !reason.trim()}
            className="btn btn-filled"
          >
            {isSubmitting ? <Spinner size={18} className="!text-current" /> : <Send aria-hidden="true" />}
            {isSubmitting ? '送信中...' : '申請する'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
