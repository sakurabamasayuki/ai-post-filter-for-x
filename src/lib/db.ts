import Dexie, { type Table } from 'dexie';

// --- Interfaces ---

export interface CachedPostResult {
  postId: string;           // Primary Key
  score: number;            // Final combined score
  heuristicScore?: number;
  mlScore?: number;
  remoteScore?: number;
  reasons: string[];
  detectedAt: number;       // Timestamp
  detectorVersion: string;
}

export interface CachedAccountResult {
  handle: string;           // Primary Key (e.g., "@username")
  score: number;
  reasons: string[];
  lastChecked: number;
  userOverride: 'human' | 'ai' | null;
  postCount: number;        // 観測した投稿数
}

export interface UserFeedback {
  postId: string;           // Primary Key
  correctLabel: 'human' | 'ai';
  feedbackAt: number;
}

export interface DailyStats {
  date: string;             // Primary Key (YYYY-MM-DD)
  totalChecked: number;
  totalHidden: number;
  totalUserOverrides: number;
}

export interface ExportData {
  posts: CachedPostResult[];
  accounts: CachedAccountResult[];
  feedback: UserFeedback[];
  stats: DailyStats[];
  version: number;
  exportedAt: number;
}

// --- Database Class ---

export class DetectorDB extends Dexie {
  posts!: Table<CachedPostResult, string>;
  accounts!: Table<CachedAccountResult, string>;
  userFeedback!: Table<UserFeedback, string>;
  statistics!: Table<DailyStats, string>;

  constructor() {
    super('DetectorDB');

    // スキーマ定義
    // インデックスが必要なフィールドのみカンマ区切りで記述
    this.version(1).stores({
      posts: 'postId, detectedAt', 
      accounts: 'handle, lastChecked',
      userFeedback: 'postId, feedbackAt',
      statistics: 'date'
    });
  }

  // --- API Methods ---

  async getPostScore(postId: string): Promise<CachedPostResult | null> {
    return (await this.posts.get(postId)) || null;
  }

  async savePostScore(result: CachedPostResult): Promise<void> {
    await this.posts.put(result);
  }

  async getAccountScore(handle: string): Promise<CachedAccountResult | null> {
    return (await this.accounts.get(handle)) || null;
  }

  async saveAccountScore(result: CachedAccountResult): Promise<void> {
    await this.accounts.put(result);
  }

  async saveUserFeedback(postId: string, label: 'human' | 'ai'): Promise<void> {
    await this.transaction('rw', [this.userFeedback, this.statistics], async () => {
      await this.userFeedback.put({
        postId,
        correctLabel: label,
        feedbackAt: Date.now()
      });
      await this.incrementStat('totalUserOverrides');
    });
  }

  /**
   * 単一フィールドをインクリメント(1ずつ)
   */
  async incrementStat(
    field: "totalChecked" | "totalHidden" | "totalUserOverrides"
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    await this.transaction("rw", this.statistics, async () => {
      const current =
        (await this.statistics.get(today)) ?? {
          date: today,
          totalChecked: 0,
          totalHidden: 0,
          totalUserOverrides: 0,
        };

      current[field] += 1;

      await this.statistics.put(current);
    });
  }

  /**
   * 複数フィールドを一度にインクリメント(効率化版)
   * 1トランザクションで複数フィールドを更新
   */
  async incrementStats(fields: {
    totalChecked?: number;
    totalHidden?: number;
    totalUserOverrides?: number;
  }): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    await this.transaction("rw", this.statistics, async () => {
      const current =
        (await this.statistics.get(today)) ?? {
          date: today,
          totalChecked: 0,
          totalHidden: 0,
          totalUserOverrides: 0,
        };

      if (typeof fields.totalChecked === "number") {
        current.totalChecked += fields.totalChecked;
      }
      if (typeof fields.totalHidden === "number") {
        current.totalHidden += fields.totalHidden;
      }
      if (typeof fields.totalUserOverrides === "number") {
        current.totalUserOverrides += fields.totalUserOverrides;
      }

      await this.statistics.put(current);
    });
  }

  async getStatistics(days: number): Promise<DailyStats[]> {
    return await this.statistics
      .orderBy('date')
      .reverse()
      .limit(days)
      .toArray();
  }

  /**
   * 指定日数より古いポストキャッシュを削除
   */
  async cleanup(daysOld: number): Promise<number> {
    const threshold = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    const oldPosts = this.posts.where('detectedAt').below(threshold);
    const count = await oldPosts.count();
    await oldPosts.delete();
    return count;
  }

  // --- Export / Import ---

  async exportAll(): Promise<ExportData> {
    return {
      posts: await this.posts.toArray(),
      accounts: await this.accounts.toArray(),
      feedback: await this.userFeedback.toArray(),
      stats: await this.statistics.toArray(),
      version: this.verno,
      exportedAt: Date.now()
    };
  }

  async importAll(data: ExportData): Promise<void> {
    await this.transaction('rw', this.tables, async () => {
      await Promise.all([
        this.posts.bulkPut(data.posts),
        this.accounts.bulkPut(data.accounts),
        this.userFeedback.bulkPut(data.feedback),
        this.statistics.bulkPut(data.stats)
      ]);
    });
  }
}

export const db = new DetectorDB();