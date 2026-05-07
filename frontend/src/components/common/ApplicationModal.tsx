import { useState, useEffect, useMemo } from 'react';
import { Send, AlertTriangle, Calendar, X } from 'lucide-react';
import { Modal } from './Modal';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedType(preselectedType || availableKinds[0] || null);
      setReason('');
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
      await onSubmit({
        type: selectedType,
        reason: reason.trim(),
        details: diff?.details || {},
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
      <div className="space-y-4 sm:space-y-5 py-1 sm:py-2">
        {/* 対象日 */}
        <div className="flex items-center gap-2.5 text-secondary-700">
          <Calendar className="w-5 h-5 text-primary-500 flex-shrink-0" />
          <span className="font-semibold text-sm sm:text-base">{date}</span>
        </div>

        {/* 差異サマリ */}
        {diff && diff.hasIssue && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 sm:p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              シフトとの差異
            </div>
            <ul className="text-sm text-amber-800 space-y-1 pl-1">
              {diff.kinds.map(kind => (
                <li key={kind}>・{APPLICATION_TYPE_LABEL[kind]}</li>
              ))}
            </ul>
            <div className="text-xs text-amber-700 pt-1 border-t border-amber-200/60 grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-2">
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
        )}

        {/* 種別選択 */}
        <div>
          <label className="label">申請種別 <span className="text-red-500">*</span></label>
          {availableKinds.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {availableKinds.map(kind => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setSelectedType(kind)}
                  className={`px-3 min-h-11 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                    selectedType === kind
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-secondary-200 bg-white text-secondary-600 hover:border-primary-200'
                  }`}
                >
                  {APPLICATION_TYPE_LABEL[kind]}
                </button>
              ))}
            </div>
          ) : (
            <select
              value={selectedType || ''}
              onChange={e => setSelectedType(e.target.value as ApplicationType)}
              className="input"
            >
              <option value="">選択してください</option>
              {(Object.keys(APPLICATION_TYPE_LABEL) as ShiftDiffKind[]).map(k => (
                <option key={k} value={k}>{APPLICATION_TYPE_LABEL[k]}</option>
              ))}
            </select>
          )}
        </div>

        {/* 理由 */}
        <div>
          <label className="label">理由 <span className="text-red-500">*</span></label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="申請理由を入力してください"
            className="input min-h-[100px] resize-y"
            rows={4}
            required
          />
          <p className="text-xs text-secondary-500 mt-1">承認者（管理者）に届く理由欄です。具体的に記載してください。</p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 px-3 sm:px-4 py-3 rounded-xl">
            <X className="w-4 h-4 flex-shrink-0" />
            <p className="text-sm font-medium break-words">{error}</p>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn btn-secondary flex-1"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedType || !reason.trim()}
            className="btn btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? '送信中...' : '申請する'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
