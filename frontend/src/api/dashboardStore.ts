import { useSyncExternalStore } from 'react';
import type { DashboardSummary } from '../types';
import { dashboardApi } from './index';
import { readCache, writeCache, onCacheCleared } from './cache';

/**
 * 管理者ダッシュボードのまとめ取得（スタッフの今日の状態・承認待ち件数）を
 * アプリ全体で 1 つだけ持つ。
 *
 * - ダッシュボード画面と、タブバー / サイドバーの件数バッジが同じデータを使うため、
 *   画面ごとに別々に取得してサーバーへの往復が増えないようにする。
 * - 前回の内容（キャッシュ）があれば、それをすぐ表示してから最新を取得する。
 * - 同時に何度呼ばれても、取得中のリクエストは 1 つにまとめる。
 */

const CACHE_KEY = 'dashboard:summary';
// 直前の取得からこの時間以内なら、force でない限り取り直さない
const MIN_INTERVAL_MS = 10_000;

interface DashboardState {
  data: DashboardSummary | undefined;
  updatedAt: number;
  refreshing: boolean;
  error: string | null;
}

let state: DashboardState = {
  data: readCache<DashboardSummary>(CACHE_KEY),
  updatedAt: 0,
  refreshing: false,
  error: null,
};
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function setState(next: Partial<DashboardState>) {
  state = { ...state, ...next };
  listeners.forEach(l => l());
}

// ログアウト等で保存内容が消されたら、手元の内容も消す
onCacheCleared(() => {
  setState({ data: undefined, updatedAt: 0, error: null });
});

export function refreshDashboard(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && state.updatedAt && Date.now() - state.updatedAt < MIN_INTERVAL_MS) {
    return Promise.resolve();
  }
  setState({ refreshing: true });
  inflight = dashboardApi
    .summary()
    .then(res => {
      if (res.success && res.data) {
        writeCache(CACHE_KEY, res.data);
        setState({ data: res.data, updatedAt: Date.now(), refreshing: false, error: null });
      } else {
        setState({ refreshing: false, error: res.error || '最新の情報を取得できませんでした' });
      }
    })
    .catch(() => {
      setState({ refreshing: false, error: '最新の情報を取得できませんでした' });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

export function useDashboardSummary(): DashboardState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** 承認待ちの件数（バッジ用）。取得できていない項目は 0 として数える。 */
export function pendingCounts(data: DashboardSummary | undefined) {
  const c = data?.counts;
  const n = (v: number | null | undefined) => (typeof v === 'number' ? v : 0);
  return {
    approvals: n(c?.pendingApplications) + n(c?.pendingSubmissions),
    shiftRequests: n(c?.pendingShiftRequests),
    paidLeave: n(c?.pendingPaidLeave),
  };
}
