export type ObservedPostKind = 'original' | 'reply' | 'repost' | 'reply-with-quote';

export interface RecordObservedAccountActivityInput {
  handle: string;
  postId: string;
  kind: ObservedPostKind;
  detectedAt?: number;
}

interface StoredObservedAccountActivity extends RecordObservedAccountActivityInput {
  id: string;
  handleNormalized: string;
  detectedAt: number;
}

export interface AccountActivitySummary {
  handle: string;
  recentWindowDays: number;
  recentPostCount: number;
  recentOriginalPostCount: number;
  recentReplyCount: number;
  recentRepostCount: number;
  recentReplyWithQuoteCount: number; // 追加
  postsPerDay: number;
}

export interface SummarizeRecentAccountActivityOptions {
  windowDays?: number;
  referenceTime?: number;
}

const DB_NAME = 'ai-post-filter-for-x-account-activity-v1';
const DB_VERSION = 1;
const STORE_NAME = 'account-activities';
const HANDLE_INDEX = 'handleNormalized';
const DETECTED_AT_INDEX = 'detectedAt';
const HANDLE_DETECTED_AT_INDEX = 'handleNormalizedDetectedAt';
const MAX_RETENTION_DAYS = 90;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, '').toLowerCase();
}

function makeId(handleNormalized: string, postId: string): string {
  return `${handleNormalized}:${postId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex(HANDLE_INDEX, 'handleNormalized', { unique: false });
        store.createIndex(DETECTED_AT_INDEX, 'detectedAt', { unique: false });
        store.createIndex(HANDLE_DETECTED_AT_INDEX, ['handleNormalized', 'detectedAt'], {
          unique: false,
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB open failed for account activity DB'));
  });
}

function runRequest<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed for account activity DB'));
  });
}

export function inferObservedPostKind(input: {
  isReply?: boolean | null;
  isRepost?: boolean | null;
}): ObservedPostKind {
  // 追加: リプライ × 引用RT の同時パターンを優先判定
  if (input.isReply && input.isRepost) return 'reply-with-quote';
  if (input.isRepost) return 'repost';
  if (input.isReply) return 'reply';
  return 'original';
}

export async function recordObservedAccountActivity(
  input: RecordObservedAccountActivityInput,
): Promise<void> {
  const handleNormalized = normalizeHandle(input.handle);
  const postId = input.postId.trim();

  if (!handleNormalized || !postId) {
    return;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const record: StoredObservedAccountActivity = {
    id: makeId(handleNormalized, postId),
    handle: input.handle,
    handleNormalized,
    postId,
    kind: input.kind,
    detectedAt: input.detectedAt ?? Date.now(),
  };

  store.put(record);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB transaction failed while saving account activity'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB transaction aborted while saving account activity'));
  });
}

export async function listObservedAccountActivities(
  handle: string,
  options: SummarizeRecentAccountActivityOptions = {},
): Promise<StoredObservedAccountActivity[]> {
  const handleNormalized = normalizeHandle(handle);
  if (!handleNormalized) {
    return [];
  }

  const referenceTime = options.referenceTime ?? Date.now();
  const windowDays = Math.max(1, Math.floor(options.windowDays ?? 14));
  const minDetectedAt = referenceTime - windowDays * 24 * 60 * 60 * 1000;

  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index(HANDLE_DETECTED_AT_INDEX);

  const range = IDBKeyRange.bound(
    [handleNormalized, minDetectedAt],
    [handleNormalized, referenceTime],
  );

  const results: StoredObservedAccountActivity[] = [];

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(range);

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }

      results.push(cursor.value as StoredObservedAccountActivity);
      cursor.continue();
    };

    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB cursor failed for account activity DB'));
  });

  return results;
}

export async function summarizeRecentAccountActivity(
  handle: string,
  options: SummarizeRecentAccountActivityOptions = {},
): Promise<AccountActivitySummary> {
  const recentWindowDays = Math.max(1, Math.floor(options.windowDays ?? 14));
  const activities = await listObservedAccountActivities(handle, {
    windowDays: recentWindowDays,
    referenceTime: options.referenceTime,
  });

  let recentOriginalPostCount = 0;
  let recentReplyCount = 0;
  let recentRepostCount = 0;
  let recentReplyWithQuoteCount = 0;

  for (const activity of activities) {
    if (activity.kind === 'reply-with-quote') {
      recentReplyWithQuoteCount += 1;
    } else if (activity.kind === 'reply') {
      recentReplyCount += 1;
    } else if (activity.kind === 'repost') {
      recentRepostCount += 1;
    } else {
      recentOriginalPostCount += 1;
    }
  }

  const recentPostCount =
    recentOriginalPostCount +
    recentReplyCount +
    recentRepostCount +
    recentReplyWithQuoteCount;

  return {
    handle,
    recentWindowDays,
    recentPostCount,
    recentOriginalPostCount,
    recentReplyCount,
    recentRepostCount,
    recentReplyWithQuoteCount,
    postsPerDay:
      recentWindowDays > 0 ? round3(recentPostCount / recentWindowDays) : 0,
  };
}

export async function cleanupObservedAccountActivities(
  olderThanDays = MAX_RETENTION_DAYS,
): Promise<number> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index(DETECTED_AT_INDEX);

  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const range = IDBKeyRange.upperBound(cutoff);

  let deletedCount = 0;

  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(range);

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }

      cursor.delete();
      deletedCount += 1;
      cursor.continue();
    };

    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB cleanup cursor failed'));
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB cleanup transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB cleanup transaction aborted'));
  });

  return deletedCount;
}

export async function hasObservedAccountActivity(handle: string): Promise<boolean> {
  const handleNormalized = normalizeHandle(handle);
  if (!handleNormalized) {
    return false;
  }

  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const index = store.index(HANDLE_INDEX);

  const count = await runRequest(index.count(IDBKeyRange.only(handleNormalized)));
  return Number(count) > 0;
}
