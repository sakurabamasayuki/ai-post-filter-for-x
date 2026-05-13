import { describe, it, expect, beforeEach } from 'vitest';
import { DetectorDB } from './db';
import 'fake-indexeddb/auto'; // Node環境でIndexedDBをシミュレート

describe('DetectorDB', () => {
  let db: DetectorDB;

  beforeEach(async () => {
    // 各テストごとに新しいクリーンなデータベースを作成
    db = new DetectorDB();
    await db.open();
  });

  it('should save and retrieve a post score', async () => {
    const mockPost = {
      postId: '12345',
      score: 0.85,
      reasons: ['pattern_match'],
      detectedAt: Date.now(),
      detectorVersion: '0.1.0'
    };

    await db.savePostScore(mockPost);
    const retrieved = await db.getPostScore('12345');
    
    expect(retrieved).toEqual(mockPost);
  });

  it('should increment statistics correctly', async () => {
    await db.incrementStat('totalChecked');
    await db.incrementStat('totalChecked');
    await db.incrementStat('totalHidden');

    const stats = await db.getStatistics(1);
    expect(stats[0].totalChecked).toBe(2);
    expect(stats[0].totalHidden).toBe(1);
  });

  it('should handle user feedback and increment overrides', async () => {
    await db.saveUserFeedback('post_99', 'ai');
    
    const feedback = await db.userFeedback.get('post_99');
    expect(feedback?.correctLabel).toBe('ai');

    const stats = await db.getStatistics(1);
    expect(stats[0].totalUserOverrides).toBe(1);
  });

  it('should cleanup old records', async () => {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    await db.posts.bulkAdd([
      { postId: 'old', detectedAt: now - (10 * dayInMs), score: 0.5, reasons: [], detectorVersion: '1' },
      { postId: 'new', detectedAt: now - (1 * dayInMs), score: 0.5, reasons: [], detectorVersion: '1' }
    ]);

    const deletedCount = await db.cleanup(5); // 5日より前を削除
    expect(deletedCount).toBe(1);
    
    const remaining = await db.posts.toArray();
    expect(remaining.length).toBe(1);
    expect(remaining[0].postId).toBe('new');
  });

  it('should export and import data', async () => {
    await db.posts.add({ postId: 'p1', score: 0.1, reasons: [], detectedAt: Date.now(), detectorVersion: 'v1' });
    const exported = await db.exportAll();

    const newDb = new DetectorDB();
    await newDb.importAll(exported);
    
    const importedPost = await newDb.getPostScore('p1');
    expect(importedPost?.postId).toBe('p1');
  });
});
