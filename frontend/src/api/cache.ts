/**
 * 画面データの一時保存（前回の表示内容を、次に開いたときすぐ出すためのキャッシュ）。
 *
 * サーバー（Google Apps Script）の応答には毎回数秒かかるため、各画面は
 *   1. 前回取得した内容があれば、それをすぐ表示する
 *   2. 裏で最新の内容を取得し、届いたら差し替えて保存し直す
 * という順で表示する（いわゆる stale-while-revalidate）。
 *
 * - 保存先はメモリと localStorage（アプリを閉じても次回すぐ表示できるように）。
 * - ログアウト時（clearCache）にすべて消す。共有端末で他の人に見えないようにするため。
 * - 給与など機密性の高いデータは保存しない（呼び出し側で使わない）。
 * - 更新系の操作（打刻・保存・申請など）が成功したら、関係する保存内容を消す
 *   （invalidateForMutation）。古い内容が一瞬でも表示されて混乱しないようにするため。
 */

interface Entry {
  t: number; // 保存した時刻 (ms)
  v: unknown;
}

const STORAGE_KEY = 'kintai_cache_v1';
const MAX_ENTRIES = 60;

let memory: Map<string, Entry> | null = null;

function load(): Map<string, Entry> {
  if (memory) return memory;
  memory = new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, Entry>;
      Object.entries(obj).forEach(([k, e]) => {
        if (e && typeof e.t === 'number') memory!.set(k, e);
      });
    }
  } catch {
    // 読めなければ空から始める（プライベートブラウズ等）
  }
  return memory;
}

function persist(): void {
  if (!memory) return;
  try {
    // 古いものから捨てて上限件数に収める
    const entries = [...memory.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, MAX_ENTRIES);
    memory = new Map(entries);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // 容量超過などで保存できなくても、メモリ上の保存は使える
  }
}

/** 保存内容を読む（無ければ undefined）。 */
export function readCache<T>(key: string): T | undefined {
  const e = load().get(key);
  return e ? (e.v as T) : undefined;
}

/** 保存する。 */
export function writeCache<T>(key: string, value: T): void {
  load().set(key, { t: Date.now(), v: value });
  persist();
}

/** 指定した接頭辞で始まる保存内容を消す。 */
export function invalidateCache(prefixes: string[]): void {
  const m = load();
  let changed = false;
  [...m.keys()].forEach(k => {
    if (prefixes.some(p => k.startsWith(p))) {
      m.delete(k);
      changed = true;
    }
  });
  if (changed) persist();
}

const clearedListeners = new Set<() => void>();

/** すべて消されたとき（ログアウト等）に呼ばれる処理を登録する。 */
export function onCacheCleared(listener: () => void): () => void {
  clearedListeners.add(listener);
  return () => {
    clearedListeners.delete(listener);
  };
}

/** すべて消す（ログアウト時）。 */
export function clearCache(): void {
  memory = new Map();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  clearedListeners.forEach(l => l());
}

/**
 * 更新系 API（action 名）が成功したときに、関係する保存内容を消す。
 * 対応が分からない操作は、安全のためすべて消す。
 */
export function invalidateForMutation(action: string): void {
  const domain = action.split('/')[0];
  const map: Record<string, string[]> = {
    clock: ['clock:', 'attendance:', 'mypage:', 'dashboard:'],
    attendance: ['clock:', 'attendance:', 'mypage:', 'dashboard:'],
    applications: ['applications:', 'attendance:', 'approvals:', 'mypage:', 'dashboard:'],
    submissions: ['clock:', 'attendance:', 'approvals:', 'mypage:', 'dashboard:'],
    'paid-leave': ['mypage:', 'approvals:', 'dashboard:'],
    'shift-requests': ['shift-requests:', 'approvals:', 'dashboard:'],
    staff: ['staff:', 'dashboard:', 'attendance:'],
    admins: ['staff:'],
    // 読み取り専用の扱いだが POST で呼ぶもの（ログイン等）は消さない
    auth: [],
    'admin-auth': [],
    'password': [],
  };
  const prefixes = map[domain];
  if (prefixes === undefined) {
    clearCache();
    return;
  }
  if (prefixes.length > 0) invalidateCache(prefixes);
}

/** 今日の日付（端末のローカル時刻）を YYYY-MM-DD で返す。キャッシュのキーに使う。 */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
