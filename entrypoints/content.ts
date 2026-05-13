import analyzeAccountSignals from '../src/lib/detector/account';
import analyzeHeuristic from '../src/lib/detector/heuristic';
import type { HeuristicResult } from '../src/lib/detector/heuristic';
import {
  getUserProfile,
  setUserProfile,
  addToFollowingSet,
  recordPostObservation,
  calcReplyCountWithinHours,
  calcQuotedReplyRatio,
} from '../src/lib/userProfileCache';
import { extractProfileFromDOM } from '../src/lib/profileFetcher';

type ViewMode = 'blur' | 'hide' | 'label';
type MlCategory = 'ai' | 'impression' | 'human' | 'mixed';

interface MlTopMatch {
  category: 'ai' | 'impression' | 'human';
  similarity: number;
  anchorIndex: number;
  anchorPreview: string;
}

interface MlResult {
  score?: number;
  category?: MlCategory;
  categoryScores?: { ai: number; impression: number; human: number };
  topMatches?: MlTopMatch[];
  lengthConfidence?: number;
}

interface AppSettings {
  enabled: boolean;
  viewMode: ViewMode;
  threshold: number;
  whitelist: string[];
  blacklist: string[];
  engine?: {
    heuristicEnabled?: boolean;
    accountEnabled?: boolean;
    mlEnabled?: boolean;
    remoteEnabled?: boolean;
    weights?: {
      heuristic?: number;
      account?: number;
      ml?: number;
      remote?: number;
    };
  };
}

const SETTINGS_KEY = 'appSettings';

const DEFAULT_SETTINGS: AppSettings = {
  enabled: true,
  viewMode: 'blur',
  threshold: 0.7,
  whitelist: [],
  blacklist: [],
  engine: {
    heuristicEnabled: true,
    accountEnabled: true,
    mlEnabled: true,
    remoteEnabled: false,
    weights: { heuristic: 0.20, account: 0.15, ml: 0.65, remote: 0 },
  },
};

let currentSettings: AppSettings = DEFAULT_SETTINGS;

const PROCESSED_ATTR = 'data-aipf-processed';
const BADGE_ATTR = 'data-aipf-badge';
const OVERLAY_ATTR = 'data-aipf-overlay';
const STYLE_ID = 'aipf-style';

const clampThreshold = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.threshold;
  return Math.min(1, Math.max(0.5, n));
};

const normalizeViewMode = (v: unknown): ViewMode => {
  return v === 'hide' || v === 'label' || v === 'blur'
    ? (v as ViewMode)
    : DEFAULT_SETTINGS.viewMode;
};

const normalizeStringArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeSettings = (raw: unknown): AppSettings => {
  const r = (raw ?? {}) as Partial<AppSettings>;
  return {
    enabled: r.enabled !== false,
    viewMode: normalizeViewMode(r.viewMode),
    threshold: clampThreshold(r.threshold),
    whitelist: normalizeStringArray(r.whitelist),
    blacklist: normalizeStringArray(r.blacklist),
    engine: {
      heuristicEnabled: r.engine?.heuristicEnabled !== false,
      accountEnabled: r.engine?.accountEnabled !== false,
      mlEnabled: r.engine?.mlEnabled !== false,
      remoteEnabled: r.engine?.remoteEnabled === true,
      weights: {
        heuristic: r.engine?.weights?.heuristic ?? 0.20,
        account: r.engine?.weights?.account ?? 0.15,
        ml: r.engine?.weights?.ml ?? 0.65,
        remote: r.engine?.weights?.remote ?? 0,
      },
    },
  };
};

const normalizeHandle = (h: string | undefined): string => {
  if (!h) return '';
  const trimmed = h.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  return lower.startsWith('@') ? lower : '@' + lower;
};

const isHandleInList = (
  handle: string | undefined,
  list: string[],
): boolean => {
  const normalized = normalizeHandle(handle);
  if (!normalized) return false;
  return list.some((item) => normalizeHandle(item) === normalized);
};

const loadSettings = async (): Promise<AppSettings> => {
  try {
    const stored = await chrome.storage.sync.get([SETTINGS_KEY, 'settings']);
    if (stored && stored[SETTINGS_KEY]) {
      return normalizeSettings(stored[SETTINGS_KEY]);
    }
    if (stored && stored.settings) {
      return normalizeSettings(stored.settings);
    }
  } catch (e) {
    console.warn('[AIPF/settings] sync get failed', e);
  }
  try {
    const stored = await chrome.storage.local.get([SETTINGS_KEY, 'settings']);
    if (stored && stored[SETTINGS_KEY]) {
      return normalizeSettings(stored[SETTINGS_KEY]);
    }
    if (stored && stored.settings) {
      return normalizeSettings(stored.settings);
    }
  } catch (e) {
    console.warn('[AIPF/settings] local get failed', e);
  }
  return normalizeSettings(null);
};

const updateList = async (
  handle: string | undefined,
  list: 'whitelist' | 'blacklist',
  action: 'add' | 'remove',
): Promise<void> => {
  const normalized = normalizeHandle(handle);
  if (!normalized) {
    console.warn('[AIPF/list] cannot update list: empty handle');
    return;
  }

  try {
    const stored = await chrome.storage.sync.get([SETTINGS_KEY]);
    const settings = normalizeSettings(stored[SETTINGS_KEY]);

    let whitelist = settings.whitelist.filter(
      (h) => normalizeHandle(h) !== normalized,
    );
    let blacklist = settings.blacklist.filter(
      (h) => normalizeHandle(h) !== normalized,
    );

    if (action === 'add') {
      if (list === 'whitelist') {
        whitelist = [...whitelist, normalized];
      } else {
        blacklist = [...blacklist, normalized];
      }
    }

    const updated: AppSettings = { ...settings, whitelist, blacklist };
    await chrome.storage.sync.set({ [SETTINGS_KEY]: updated });

    console.log('[AIPF/list] updated', {
      handle: normalized,
      list,
      action,
    });
  } catch (e) {
    console.error('[AIPF/list] update failed', e);
  }
};

// ---------- スタイル ----------
const ensureGlobalStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .aipf-badge-group {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: 6px;
      vertical-align: middle;
      position: relative;
    }

    .aipf-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      border-radius: 999px;
      letter-spacing: 0.02em;
      color: #fff;
      user-select: none;
      pointer-events: auto;
      cursor: help;
    }
    .aipf-badge[data-label="ai"]         { background: #d9363e; }
    .aipf-badge[data-label="impression"] { background: #b34dd9; }
    .aipf-badge[data-label="mixed"]      { background: #d98926; }
    .aipf-badge[data-label="human"]      { background: #2a8f4f; }

    .aipf-badge .aipf-badge-score {
      opacity: 0.85;
      font-weight: 500;
    }

    .aipf-tooltip {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      z-index: 99999;
      min-width: 280px;
      max-width: 380px;
      padding: 10px 12px;
      background: rgba(15, 20, 25, 0.96);
      color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
      font-size: 11px;
      line-height: 1.5;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
      font-family: ui-sans-serif, system-ui, sans-serif;
    }
    .aipf-badge-group:hover .aipf-tooltip {
      opacity: 1;
      pointer-events: auto;
    }
    .aipf-tooltip-title {
      font-weight: 700;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .aipf-tooltip-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 2px 0;
    }
    .aipf-tooltip-row-label {
      opacity: 0.7;
    }
    .aipf-tooltip-divider {
      border-top: 1px solid rgba(255,255,255,0.15);
      margin: 6px 0;
    }
    .aipf-tooltip-signal {
      padding: 2px 0;
      font-size: 10px;
      opacity: 0.85;
    }
    .aipf-tooltip-signal-tag {
      display: inline-block;
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 700;
      margin-right: 6px;
    }
    .aipf-tooltip-signal-tag[data-cat="ai"] { background: rgba(217,54,62,0.4); }
    .aipf-tooltip-signal-tag[data-cat="impression"] { background: rgba(179,77,217,0.4); }
    .aipf-tooltip-signal-tag[data-cat="human"] { background: rgba(42,143,79,0.4); }

    .aipf-list-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      border-radius: 999px;
      cursor: pointer;
      border: 1px solid rgba(128, 128, 128, 0.4);
      background: rgba(128, 128, 128, 0.15);
      color: rgb(140, 140, 140);
      transition: all 0.12s ease;
      user-select: none;
      font-family: inherit;
    }
    .aipf-list-btn:hover {
      background: rgba(128, 128, 128, 0.3);
      color: #fff;
      transform: translateY(-1px);
    }
    .aipf-list-btn[data-active="wl"] {
      background: #2a8f4f;
      border-color: #2a8f4f;
      color: #fff;
    }
    .aipf-list-btn[data-active="bl"] {
      background: #d9363e;
      border-color: #d9363e;
      color: #fff;
    }

    /* モーダルポップアップ */
    .aipf-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .aipf-modal {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      max-width: 550px;
      width: 95%;
      max-height: 85vh;
      overflow-y: auto;
      animation: slideUp 0.2s ease;
      color: #000;
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .aipf-modal-header {
      padding: 20px;
      border-bottom: 1px solid #e1e8ed;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .aipf-modal-title {
      font-size: 18px;
      font-weight: 700;
    }

    .aipf-modal-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #657786;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.2s;
    }

    .aipf-modal-close:hover {
      background: #f7f9fa;
    }

    .aipf-modal-body {
      padding: 20px;
    }

    .aipf-score-row {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 12px;
      margin-bottom: 16px;
      align-items: center;
    }

    .aipf-score-label {
      font-weight: 600;
      font-size: 13px;
    }

    .aipf-score-bar-container {
      height: 24px;
      background: #f7f9fa;
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }

    .aipf-score-bar {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 8px;
      font-weight: 600;
      font-size: 12px;
      color: #fff;
      transition: width 0.3s ease;
    }

    .aipf-score-bar[data-cat="ai"] {
      background: linear-gradient(90deg, #d9363e 0%, #e74c3c 100%);
    }

    .aipf-score-bar[data-cat="impression"] {
      background: linear-gradient(90deg, #b34dd9 0%, #9b59b6 100%);
    }

    .aipf-score-bar[data-cat="heuristic"] {
      background: linear-gradient(90deg, #3498db 0%, #2980b9 100%);
    }

    .aipf-score-bar[data-cat="account"] {
      background: linear-gradient(90deg, #2a8f4f 0%, #27ae60 100%);
    }

    .aipf-final-score {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 16px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 20px;
    }

    .aipf-final-score-label {
      color: rgba(255,255,255,0.8);
      font-size: 12px;
      margin-bottom: 4px;
    }

    .aipf-final-score-value {
      font-size: 36px;
      font-weight: 700;
      color: #fff;
    }

    .aipf-final-score-category {
      font-size: 12px;
      color: rgba(255,255,255,0.9);
      margin-top: 4px;
    }

    .aipf-divider {
      height: 1px;
      background: #e1e8ed;
      margin: 16px 0;
    }

    .aipf-signals-section {
      margin-top: 20px;
    }

    .aipf-signals-title {
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 12px;
      color: #1a1a1a;
      padding-bottom: 8px;
      border-bottom: 2px solid #667eea;
    }

    .aipf-table-wrapper {
      overflow-x: auto;
    }

    .aipf-table-wrapper table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    }

    .aipf-table-wrapper th {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      padding: 10px 8px;
      text-align: left;
      font-weight: 700;
      font-size: 12px;
    }

    .aipf-table-wrapper td {
      padding: 10px 8px;
      border-bottom: 1px solid #e1e8ed;
    }

    .aipf-table-wrapper tr:hover {
      background: #f7f9fa;
    }

    .aipf-table-wrapper .aipf-label-cell {
      font-weight: 600;
      width: 40%;
    }

    .aipf-table-wrapper .aipf-score-cell {
      text-align: right;
      font-weight: 700;
      width: 30%;
    }

    .aipf-table-wrapper .aipf-weight-cell {
      text-align: right;
      color: #657786;
      width: 30%;
    }

    .aipf-table-wrapper .aipf-sub-row td {
      background: #f7f9fa;
      font-size: 11px;
      color: #657786;
      padding: 6px 8px;
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    }

    .aipf-signal-item {
      padding: 12px;
      background: #f7f9fa;
      border-radius: 8px;
      margin-bottom: 12px;
      font-size: 12px;
      border-left: 3px solid #e1e8ed;
      transition: all 0.2s ease;
    }

    .aipf-signal-item:hover {
      background: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .aipf-signal-item[data-cat="ai"] {
      border-left-color: #d9363e;
    }

    .aipf-signal-item[data-cat="impression"] {
      border-left-color: #b34dd9;
    }

    .aipf-signal-item[data-cat="human"] {
      border-left-color: #2a8f4f;
    }

    .aipf-signal-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 700;
      margin-right: 8px;
      font-size: 11px;
      color: #fff;
    }

    .aipf-signal-tag[data-cat="ai"] {
      background: #d9363e;
    }

    .aipf-signal-tag[data-cat="impression"] {
      background: #b34dd9;
    }

    .aipf-signal-tag[data-cat="human"] {
      background: #2a8f4f;
    }

    .aipf-signal-content {
      color: #657786;
      margin-top: 4px;
    }

    .aipf-overlay-host {
      position: relative;
    }

    .aipf-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 8px;
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-radius: 12px;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
      z-index: 9999;
      transition: opacity 0.15s ease;
    }
    .aipf-overlay[data-revealed="1"] {
      opacity: 0;
      pointer-events: none;
    }
    .aipf-overlay-title {
      font-size: 14px;
    }
    .aipf-overlay-sub {
      font-size: 11px;
      font-weight: 500;
      opacity: 0.85;
    }
    .aipf-overlay-action {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.4);
    }
  `;
  document.documentElement.appendChild(style);
};

// ---------- モーダル表示 ----------
const showDetailModal = (
  finalScore: number,
  category: MlCategory,
  mlResult: MlResult | null,
  heuristicResult: HeuristicResult | null,
  accountScore: number,
) => {
  const backdrop = document.createElement('div');
  backdrop.className = 'aipf-modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'aipf-modal';

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'aipf-modal-header';

  const title = document.createElement('div');
  title.className = 'aipf-modal-title';
  title.textContent = '判定詳細';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'aipf-modal-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => backdrop.remove());
  header.appendChild(closeBtn);

  modal.appendChild(header);

  // ボディ
  const body = document.createElement('div');
  body.className = 'aipf-modal-body';

    // 最終スコア
  const finalScoreDiv = document.createElement('div');
  finalScoreDiv.className = 'aipf-final-score';
  finalScoreDiv.innerHTML = `
    <div class="aipf-final-score-label">最終スコア</div>
    <div class="aipf-final-score-value">${(finalScore * 100).toFixed(1)}%</div>
    <div class="aipf-final-score-category">カテゴリ: ${category.toUpperCase()}</div>
  `;
  body.appendChild(finalScoreDiv);

  // ========================================
  // スコア分析テーブル
  // ========================================
  const tableDiv = document.createElement('div');
  tableDiv.innerHTML = '<div class="aipf-signals-title" style="margin-bottom: 12px;">スコア詳細</div>';
  tableDiv.style.marginBottom = '20px';

  const tableWrapper = document.createElement('div');
  tableWrapper.className = 'aipf-table-wrapper';

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';

  // ヘッダー
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>項目</th>
      <th style="text-align: right;">スコア</th>
      <th style="text-align: right;">重み</th>
    </tr>
  `;
  table.appendChild(thead);

  // ボディ
  const tbody = document.createElement('tbody');

  // ヒューリスティック行
  if (heuristicResult) {
    const hRow = document.createElement('tr');
    const hWeight = currentSettings.engine?.weights?.heuristic ?? 0.35;
    hRow.innerHTML = `
      <td class="aipf-label-cell" style="color: #3498db;">▪ ヒューリスティック</td>
      <td class="aipf-score-cell">${(heuristicResult.finalScore * 100).toFixed(1)}%</td>
      <td class="aipf-weight-cell">${(hWeight * 100).toFixed(0)}%</td>
    `;
    tbody.appendChild(hRow);

    // サブ情報
    const subRow = document.createElement('tr');
    subRow.className = 'aipf-sub-row';
    subRow.innerHTML = `
      <td colspan="3">
        AI: ${(heuristicResult.aiScore * 100).toFixed(1)}% | 
        インプレ: ${(heuristicResult.impressionScore * 100).toFixed(1)}% | 
        人間: ${(heuristicResult.humanScore * 100).toFixed(1)}% | 
        信頼度: ${(heuristicResult.confidence * 100).toFixed(0)}%
      </td>
    `;
    tbody.appendChild(subRow);
  }

  // ML判定行
  if (mlResult?.score !== undefined) {
    const mRow = document.createElement('tr');
    const mWeight = currentSettings.engine?.weights?.ml ?? 0.45;
    mRow.innerHTML = `
      <td class="aipf-label-cell" style="color: #d9363e;">▪ ML判定</td>
      <td class="aipf-score-cell">${(mlResult.score * 100).toFixed(1)}%</td>
      <td class="aipf-weight-cell">${(mWeight * 100).toFixed(0)}%</td>
    `;
    tbody.appendChild(mRow);

    // MLカテゴリサブ情報
    if (mlResult.categoryScores) {
      const mlSubRow = document.createElement('tr');
      mlSubRow.className = 'aipf-sub-row';
      mlSubRow.innerHTML = `
        <td colspan="3">
          AI: ${(mlResult.categoryScores.ai * 100).toFixed(1)}% | 
          インプレ: ${(mlResult.categoryScores.impression * 100).toFixed(1)}% | 
          人間: ${(mlResult.categoryScores.human * 100).toFixed(1)}%
        </td>
      `;
      tbody.appendChild(mlSubRow);
    }
  }

  // アカウント信号行
  const aRow = document.createElement('tr');
  const aWeight = currentSettings.engine?.weights?.account ?? 0.2;
  aRow.innerHTML = `
    <td class="aipf-label-cell" style="color: #2a8f4f;">▪ アカウント信号</td>
    <td class="aipf-score-cell">${(accountScore * 100).toFixed(1)}%</td>
    <td class="aipf-weight-cell">${(aWeight * 100).toFixed(0)}%</td>
  `;
  tbody.appendChild(aRow);

  table.appendChild(tbody);
  tableWrapper.appendChild(table);
  tableDiv.appendChild(tableWrapper);
  body.appendChild(tableDiv);

  // ========================================
  // ML カテゴリスコア(棒グラフ + ASCII)
  // ========================================
  if (mlResult?.categoryScores) {
    const divider1 = document.createElement('div');
    divider1.className = 'aipf-divider';
    body.appendChild(divider1);

    const mlCatDiv = document.createElement('div');
    mlCatDiv.innerHTML = `<div class="aipf-signals-title">MLカテゴリスコア</div>`;

    // 棒グラフを作成する関数
    const makeBarGraph = (percent, filledChar = '█', emptyChar = '░', totalChars = 17) => {
      const filledCount = Math.round((percent / 100) * totalChars);
      const emptyCount = totalChars - filledCount;
      return filledChar.repeat(filledCount) + emptyChar.repeat(emptyCount);
    };

    // AI
    const aiPercent = mlResult.categoryScores.ai * 100;
    const aiBar = makeBarGraph(aiPercent);
    const aiRow = document.createElement('div');
    aiRow.style.marginBottom = '12px';
    aiRow.style.fontFamily = 'monospace';
    aiRow.style.fontSize = '13px';
    aiRow.style.fontWeight = '700';
    aiRow.style.lineHeight = '1.8';
    aiRow.style.color = '#d9363e';
    aiRow.innerHTML = `AI<br>${aiBar} ${aiPercent.toFixed(1)}%`;
    mlCatDiv.appendChild(aiRow);

    // インプレ
    const impPercent = mlResult.categoryScores.impression * 100;
    const impBar = makeBarGraph(impPercent);
    const impRow = document.createElement('div');
    impRow.style.marginBottom = '12px';
    impRow.style.fontFamily = 'monospace';
    impRow.style.fontSize = '13px';
    impRow.style.fontWeight = '700';
    impRow.style.lineHeight = '1.8';
    impRow.style.color = '#b34dd9';
    impRow.innerHTML = `インプレ<br>${impBar} ${impPercent.toFixed(1)}%`;
    mlCatDiv.appendChild(impRow);

    // 人間
    const humPercent = mlResult.categoryScores.human * 100;
    const humBar = makeBarGraph(humPercent);
    const humRow = document.createElement('div');
    humRow.style.marginBottom = '0';
    humRow.style.fontFamily = 'monospace';
    humRow.style.fontSize = '13px';
    humRow.style.fontWeight = '700';
    humRow.style.lineHeight = '1.8';
    humRow.style.color = '#2a8f4f';
    humRow.innerHTML = `人間<br>${humBar} ${humPercent.toFixed(1)}%`;
    mlCatDiv.appendChild(humRow);

    body.appendChild(mlCatDiv);
  }

  // ========================================
  // ヒューリスティック検出パターン
  // ========================================
  if (heuristicResult && heuristicResult.signals.length > 0) {
    const divider2 = document.createElement('div');
    divider2.className = 'aipf-divider';
    body.appendChild(divider2);

    const signalsDiv = document.createElement('div');
    signalsDiv.className = 'aipf-signals-section';
    signalsDiv.innerHTML = `<div class="aipf-signals-title">検出されたパターン (${heuristicResult.signals.length}件)</div>`;

    // スコア別にソート
    const sortedSignals = heuristicResult.signals
      .slice()
      .sort((a, b) => b.weight - a.weight);

    sortedSignals.forEach((sig) => {
      const sigItem = document.createElement('div');
      sigItem.className = 'aipf-signal-item';
      sigItem.setAttribute('data-cat', sig.category);

      // カテゴリラベル
      const categoryInfo = {
        ai: { label: 'AI生成', color: '#d9363e', bgColor: '#fff5f5', icon: '🤖' },
        impression: { label: 'インプレ稼ぎ', color: '#b34dd9', bgColor: '#faf5ff', icon: '📈' },
        human: { label: '人間らしい', color: '#2a8f4f', bgColor: '#f0fdf4', icon: '👤' },
      };

      const info = categoryInfo[sig.category] || categoryInfo.ai;

      const escaped = sig.matched
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .slice(0, 60);

      // ルール説明マッピング
      const ruleDescriptions: { [key: string]: string } = {
        'ai/structured-intro': '文章が構造的な導入で始まる',
        'ai/enumeration': '「第一に」「第二に」など番号付けがある',
        'ai/cta': '「参考になれば幸いです」など典型的なAI表現',
        'ai/brackets': '【】で囲まれた構造化テキスト',
        'ai/checkmarks': '✅絵文字が連続して使われている',
        'ai/em-dashes': 'em-dash(—)が複数使用されている',
        'ai/english-phrases': '「Great question!」など英語フレーズ',
        'impression/urgent': '「今すぐ」「限定」など緊迫感を煽る表現',
        'impression/save': '「保存推奨」「ブクマ必須」など保存を勧める',
        'impression/unknown': '「99%が知らない」など知識の独占性をアピール',
        'impression/fomo': '「知らないと損」など不安を煽る表現',
        'impression/followup': '「フォロー必須」など行動を強要',
        'impression/dm': '「DMで詳細」など別チャネルへの誘導',
        'impression/money': '「副業月収」「稼げる」など金銭訴求',
        'impression/hashtags': 'ハッシュタグが過剰に使用されている',
        'impression/flames': '🔥絵文字が連続して使われている',
        'impression/limited': '「先着100名」など希少性を強調',
        'impression/freebie': '「無料配布」「無料プレゼント」',
        'human/lol': '「w」「草」など笑いを表現する表記',
        'human/casual': '「めっちゃ」「ガチで」など日本語の口語表現',
        'human/personal': '「俺が」「今日のランチ」など個人的な経験',
        'human/sad-emoji': '😭😂😩など感情絵文字が使われている',
      };

      const description = ruleDescriptions[sig.rule] || sig.rule;

      sigItem.innerHTML = `
        <div style="background: ${info.bgColor}; padding: 12px; border-radius: 8px; border-left: 3px solid ${info.color};">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="font-size: 16px;">${info.icon}</span>
            <span style="font-weight: 700; color: ${info.color}; font-size: 13px;">${info.label}</span>
            <span style="margin-left: auto; font-weight: 700; color: ${info.color}; font-size: 14px;">${(sig.weight * 100).toFixed(0)}%</span>
          </div>
          
          <div style="margin-bottom: 8px;">
            <div style="color: #1a1a1a; font-weight: 600; font-size: 13px; margin-bottom: 4px;">何が検出されたのか</div>
            <div style="color: #657786; font-size: 12px; line-height: 1.5;">${description}</div>
          </div>
          
          <div>
            <div style="color: #1a1a1a; font-weight: 600; font-size: 13px; margin-bottom: 4px;">検出箇所</div>
            <div style="background: #fff; padding: 8px; border-radius: 4px; font-family: monospace; font-size: 11px; color: #657786; border: 1px solid ${info.color}33; word-break: break-word;">
              "${escaped}${sig.matched.length > 60 ? '…' : ''}"
            </div>
          </div>
        </div>
      `;
      signalsDiv.appendChild(sigItem);
    });

    body.appendChild(signalsDiv);
  }

  // ========================================
  // 合成比率(重み)情報(ASCII棒グラフ)
  // ========================================
  if (currentSettings.engine?.weights) {
    const divider3 = document.createElement('div');
    divider3.className = 'aipf-divider';
    body.appendChild(divider3);
 
    const weightsDiv = document.createElement('div');
    weightsDiv.innerHTML = `<div class="aipf-signals-title">スコア合成比率</div>`;
 
    const weights = currentSettings.engine.weights;
    const hWeight = weights.heuristic ?? 0.20;
    const aWeight = weights.account ?? 0.15;
    const mWeight = weights.ml ?? 0.65;
 
    // 棒グラフを作成する関数
    const makeBarGraph = (percent, filledChar = '█', emptyChar = '░', totalChars = 20) => {
      const filledCount = Math.round((percent / 100) * totalChars);
      const emptyCount = totalChars - filledCount;
      return filledChar.repeat(filledCount) + emptyChar.repeat(emptyCount);
    };
 
    // ★ 修正: 順序を変更（ヒューリスティック → アカウント評価 → 機械学習）
 
    // ヒューリスティック棒
    const hPercent = hWeight * 100;
    const hBar = makeBarGraph(hPercent);
    const hWeightRow = document.createElement('div');
    hWeightRow.style.marginBottom = '12px';
    hWeightRow.style.fontFamily = 'monospace';
    hWeightRow.style.fontSize = '13px';
    hWeightRow.style.fontWeight = '700';
    hWeightRow.style.lineHeight = '1.8';
    hWeightRow.style.color = '#3498db';
    hWeightRow.innerHTML = `ヒューリスティック<br>${hBar} ${hPercent.toFixed(0)}%`;
    weightsDiv.appendChild(hWeightRow);
 
    // アカウント信号棒（新しい位置）
    const aPercent = aWeight * 100;
    const aBar = makeBarGraph(aPercent);
    const aWeightRow = document.createElement('div');
    aWeightRow.style.marginBottom = '12px';
    aWeightRow.style.fontFamily = 'monospace';
    aWeightRow.style.fontSize = '13px';
    aWeightRow.style.fontWeight = '700';
    aWeightRow.style.lineHeight = '1.8';
    aWeightRow.style.color = '#2a8f4f';
    aWeightRow.innerHTML = `アカウント評価<br>${aBar} ${aPercent.toFixed(0)}%`;
    weightsDiv.appendChild(aWeightRow);
 
    // ML判定棒（最後に移動）
    const mPercent = mWeight * 100;
    const mBar = makeBarGraph(mPercent);
    const mWeightRow = document.createElement('div');
    mWeightRow.style.marginBottom = '0';
    mWeightRow.style.fontFamily = 'monospace';
    mWeightRow.style.fontSize = '13px';
    mWeightRow.style.fontWeight = '700';
    mWeightRow.style.lineHeight = '1.8';
    mWeightRow.style.color = '#d9363e';
    mWeightRow.innerHTML = `機械学習<br>${mBar} ${mPercent.toFixed(0)}%`;
    weightsDiv.appendChild(mWeightRow);
 
    body.appendChild(weightsDiv);
  }


  modal.appendChild(body);
  backdrop.appendChild(modal);

  // 背景クリックで閉じる
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      backdrop.remove();
    }
  });

  document.body.appendChild(backdrop);
};

// ---------- バッジ・ツールチップ ----------
const removeBadge = (article: HTMLElement) => {
  article
    .querySelectorAll<HTMLElement>(`[${BADGE_ATTR}]`)
    .forEach((n) => n.remove());
  article
    .querySelectorAll<HTMLElement>('.aipf-badge-group')
    .forEach((n) => n.remove());
};

const categoryToBadgeText = (cat: MlCategory): string => {
  switch (cat) {
    case 'ai':
      return 'AI';
    case 'impression':
      return 'IMP';
    case 'human':
      return 'HUMAN';
    default:
      return 'MIXED';
  }
};

const buildTooltipHtml = (
  finalScore: number,
  category: MlCategory,
  mlResult: MlResult | null,
  heuristicResult: HeuristicResult | null,
  accountScore: number,
): string => {
  let html = `<div class="aipf-tooltip-title">判定詳細</div>`;

  html += `<div class="aipf-tooltip-row">
    <span class="aipf-tooltip-row-label">最終スコア</span>
    <span>${(finalScore * 100).toFixed(1)}%</span>
  </div>`;

  html += `<div class="aipf-tooltip-row">
    <span class="aipf-tooltip-row-label">カテゴリ</span>
    <span>${category.toUpperCase()}</span>
  </div>`;

  if (mlResult?.categoryScores) {
    const cs = mlResult.categoryScores;
    html += `<div class="aipf-tooltip-divider"></div>`;
    html += `<div class="aipf-tooltip-row"><span class="aipf-tooltip-row-label">ML: AI</span><span>${(cs.ai * 100).toFixed(1)}%</span></div>`;
    html += `<div class="aipf-tooltip-row"><span class="aipf-tooltip-row-label">ML: インプレ</span><span>${(cs.impression * 100).toFixed(1)}%</span></div>`;
    html += `<div class="aipf-tooltip-row"><span class="aipf-tooltip-row-label">ML: 人間</span><span>${(cs.human * 100).toFixed(1)}%</span></div>`;
  }

  if (heuristicResult && heuristicResult.signals.length > 0) {
    html += `<div class="aipf-tooltip-divider"></div>`;
    html += `<div class="aipf-tooltip-row"><span class="aipf-tooltip-row-label">ヒューリスティック</span><span>${(heuristicResult.finalScore * 100).toFixed(1)}%</span></div>`;
    html += `<div class="aipf-tooltip-row"><span class="aipf-tooltip-row-label">検出パターン</span><span>${heuristicResult.signals.length}件</span></div>`;

    const topSignals = heuristicResult.signals
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4);

    topSignals.forEach((s) => {
      const tag = s.category === 'ai' ? 'AI' : s.category === 'impression' ? 'IMP' : 'HUM';
      const escaped = s.matched.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += `<div class="aipf-tooltip-signal">
        <span class="aipf-tooltip-signal-tag" data-cat="${s.category}">${tag}</span>
        <span style="opacity:0.8;">${s.rule}</span>: ${escaped}
      </div>`;
    });
  }

  html += `<div class="aipf-tooltip-divider"></div>`;
  html += `<div class="aipf-tooltip-row"><span class="aipf-tooltip-row-label">アカウント信号</span><span>${(accountScore * 100).toFixed(1)}%</span></div>`;

  return html;
};

const mountBadge = (
  article: HTMLElement,
  finalScore: number,
  category: MlCategory,
  mlResult: MlResult | null,
  heuristicResult: HeuristicResult | null,
  accountScore: number,
  handle: string | undefined,
  isWL: boolean,
  isBL: boolean,
) => {
  removeBadge(article);

  const target =
    article.querySelector<HTMLElement>('[data-testid="User-Name"]') ??
    article.querySelector<HTMLElement>('a[href*="/status/"]')?.parentElement ??
    article.querySelector<HTMLElement>('div[dir="ltr"]') ??
    article;

  const group = document.createElement('span');
  group.className = 'aipf-badge-group';
  group.setAttribute(BADGE_ATTR, '1');

  const badge = document.createElement('span');
  badge.className = 'aipf-badge';
  badge.setAttribute('data-label', category);
  badge.innerHTML = `
    <span>${categoryToBadgeText(category)}</span>
    <span class="aipf-badge-score">${(finalScore * 100).toFixed(0)}%</span>
  `;
  
  // バッジクリックでモーダル表示
  badge.style.cursor = 'pointer';
  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showDetailModal(finalScore, category, mlResult, heuristicResult, accountScore);
  });
  
  group.appendChild(badge);

  const tooltip = document.createElement('div');
  tooltip.className = 'aipf-tooltip';
  tooltip.innerHTML = buildTooltipHtml(
    finalScore,
    category,
    mlResult,
    heuristicResult,
    accountScore,
  );
  group.appendChild(tooltip);

  if (handle) {
    const wlBtn = document.createElement('button');
    wlBtn.type = 'button';
    wlBtn.className = 'aipf-list-btn';
    wlBtn.textContent = isWL ? '✓ WL' : 'WL';
    wlBtn.title = isWL ? 'ホワイトリストから削除' : 'ホワイトリストに追加';
    if (isWL) wlBtn.setAttribute('data-active', 'wl');

    wlBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await updateList(handle, 'whitelist', isWL ? 'remove' : 'add');
    });
    group.appendChild(wlBtn);

    const blBtn = document.createElement('button');
    blBtn.type = 'button';
    blBtn.className = 'aipf-list-btn';
    blBtn.textContent = isBL ? '✗ BL' : 'BL';
    blBtn.title = isBL ? 'ブラックリストから削除' : 'ブラックリストに追加';
    if (isBL) blBtn.setAttribute('data-active', 'bl');

    blBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await updateList(handle, 'blacklist', isBL ? 'remove' : 'add');
    });
    group.appendChild(blBtn);
  }

  target.appendChild(group);
};

// ---------- ブラーオーバーレイ ----------
const removeOverlay = (article: HTMLElement) => {
  article
    .querySelectorAll<HTMLElement>(`[${OVERLAY_ATTR}]`)
    .forEach((n) => n.remove());
  article.classList.remove('aipf-overlay-host');
};

const mountBlurOverlay = (
  article: HTMLElement,
  finalScore: number,
  category: MlCategory,
  handle: string | undefined,
  reason?: string,
) => {
  removeOverlay(article);
  article.classList.add('aipf-overlay-host');

  const overlay = document.createElement('div');
  overlay.className = 'aipf-overlay';
  overlay.setAttribute(OVERLAY_ATTR, '1');

  const labelText =
    reason === 'blacklist'
      ? 'ブラックリスト'
      : category === 'ai'
        ? 'AI判定'
        : category === 'impression'
          ? 'インプレ稼ぎ'
          : category === 'mixed'
            ? 'MIXED判定'
            : '判定';

  const subText =
    reason === 'blacklist'
      ? 'このアカウントはブラックリスト登録済み'
      : `スコア ${(finalScore * 100).toFixed(0)}%`;

  overlay.innerHTML = `
    <div class="aipf-overlay-title">${labelText}</div>
    <div class="aipf-overlay-sub">${subText}</div>
    <div class="aipf-overlay-action">クリックで表示</div>
  `;

  overlay.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (reason === 'blacklist' && handle) {
      await updateList(handle, 'blacklist', 'remove');
    }

    overlay.setAttribute('data-revealed', '1');
    setTimeout(() => overlay.remove(), 200);
  });

  article.appendChild(overlay);
};

// ---------- 表示適用 ----------
const applyViewToArticle = (
  article: HTMLElement,
  finalScore: number,
  category: MlCategory,
  mlResult: MlResult | null,
  heuristicResult: HeuristicResult | null,
  accountScore: number,
  handle: string | undefined,
  settings: AppSettings,
) => {
  article.style.removeProperty('display');
  article.removeAttribute('data-aipf-hidden');
  removeOverlay(article);
  removeBadge(article);

  if (!settings.enabled) return;

  const isWL = isHandleInList(handle, settings.whitelist);
  const isBL = isHandleInList(handle, settings.blacklist);

  mountBadge(
    article,
    finalScore,
    category,
    mlResult,
    heuristicResult,
    accountScore,
    handle,
    isWL,
    isBL,
  );

  if (isWL) return;

  if (isBL) {
    switch (settings.viewMode) {
      case 'hide':
        article.style.display = 'none';
        article.setAttribute('data-aipf-hidden', '1');
        break;
      case 'blur':
      case 'label':
        mountBlurOverlay(article, finalScore, category, handle, 'blacklist');
        break;
    }
    return;
  }

  const passThreshold = finalScore >= settings.threshold;
  if (!passThreshold) return;

  switch (settings.viewMode) {
    case 'hide':
      article.style.display = 'none';
      article.setAttribute('data-aipf-hidden', '1');
      break;
    case 'blur':
      mountBlurOverlay(article, finalScore, category, handle);
      break;
    case 'label':
      break;
  }
};

export default defineContentScript({
  matches: [
    '*://x.com/*',
    '*://*.x.com/*',
    '*://twitter.com/*',
    '*://*.twitter.com/*',
  ],
  runAt: 'document_idle',
  main() {
    console.log('[AIPF] content script started (v3: heuristic + ML)');

    ensureGlobalStyle();

    const seen = new WeakSet<HTMLElement>();
    const articleMlCache = new WeakMap<HTMLElement, MlResult>();
    const articleHeuristicCache = new WeakMap<HTMLElement, HeuristicResult>();
    const articleAccountScoreCache = new WeakMap<HTMLElement, number>();

    // ========================================
    // 修正版: reapplyAll関数
    // 既存の reapplyAll を以下に置き換えてください
    // ========================================

    const reapplyAll = () => {
      document
        .querySelectorAll<HTMLElement>(`[${PROCESSED_ATTR}]`)
        .forEach((a) => {
          const h = a.getAttribute('data-aipf-handle') ?? undefined;
          const mlResult = articleMlCache.get(a) ?? null;
          const heuristicResult = articleHeuristicCache.get(a) ?? null;
          const accountScore = articleAccountScoreCache.get(a) ?? 0.5;

          // ホワイトリスト/ブラックリストは特別扱い(再計算しない)
          const isWL = isHandleInList(h, currentSettings.whitelist);
          const isBL = isHandleInList(h, currentSettings.blacklist);

          let finalScore: number;
          let finalCategory: MlCategory;

          if (isBL) {
            finalScore = 1.0;
            finalCategory = 'ai';
          } else if (isWL) {
            finalScore = 0.0;
            finalCategory = 'human';
          } else {
            // ★ 重要: 現在の重みで再合成
            const heuristicScore = heuristicResult?.finalScore ?? null;
            const mlScore = mlResult?.score ?? null;
            finalScore = composeFinalScore(heuristicScore, mlScore, accountScore);
            finalCategory = decideFinalCategory(
              finalScore,
              heuristicResult,
              mlResult?.category,
            );

            // 属性も更新(他箇所で参照されるため)
            a.setAttribute('data-aipf-score', finalScore.toFixed(3));
            a.setAttribute('data-aipf-category', finalCategory);
          }

          applyViewToArticle(
            a,
            finalScore,
            finalCategory,
            mlResult,
            heuristicResult,
            accountScore,
            h,
            currentSettings,
          );
        });
    };

    void (async () => {
      currentSettings = await loadSettings();
      console.log('[AIPF/settings] loaded', currentSettings);
      reapplyAll();
    })();

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' && area !== 'local') return;
        const change = changes[SETTINGS_KEY] ?? changes.settings;
        if (!change) return;

        currentSettings = normalizeSettings(change.newValue);
        console.log('[AIPF/settings] changed', currentSettings);
        reapplyAll();
      });
    } catch (e) {
      console.warn('[AIPF/settings] onChanged listener failed', e);
    }

    const extractPostId = (article: HTMLElement): string | undefined => {
      const a = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
      const href = a?.getAttribute('href') ?? '';
      const m = href.match(/\/status\/(\d+)/);
      return m ? m[1] : undefined;
    };

    const extractHandle = (article: HTMLElement): string | undefined => {
      const spans = article.querySelectorAll<HTMLSpanElement>(
        'a[role="link"] span',
      );
      for (const s of Array.from(spans)) {
        const t = s.textContent?.trim();
        if (t && t.startsWith('@')) return t;
      }
      const anchor = article.querySelector<HTMLAnchorElement>('a[href^="/"]');
      const href = anchor?.getAttribute('href') ?? '';
      const m = href.match(/^\/([^/]+)/);
      return m ? '@' + m[1] : undefined;
    };

    const extractDisplayName = (article: HTMLElement): string | undefined => {
      const node = article.querySelector('[data-testid="User-Name"]');
      const text = node?.textContent?.trim();
      return text || undefined;
    };

    const extractText = (article: HTMLElement): string => {
      const node = article.querySelector('[data-testid="tweetText"]');
      return (node?.textContent ?? '').trim();
    };

    const isReplyPost = (article: HTMLElement): boolean => {
      const text = article.textContent ?? '';
      return /Replying to|返信先/.test(text);
    };

    const isRepostPost = (article: HTMLElement): boolean => {
      const text = article.textContent ?? '';
      return /Reposted|リポスト|Retweeted|リツイート/.test(text);
    };

    // 引用ツイートが含まれているか判定
    // X(Twitter)では引用元が `[role="link"][tabindex]` の入れ子tweet として表示される
    const hasQuotedTweet = (article: HTMLElement): boolean => {
      // 引用ツイート部分は通常 `role="link"` で包まれた tweet container を持つ
      const quoted = article.querySelector('div[role="link"][tabindex] [data-testid="tweetText"]');
      return !!quoted;
    };

    // 投稿のタイプを判定
    const detectPostType = (
      article: HTMLElement,
    ): 'reply' | 'quoted-reply' | 'original' | 'repost' => {
      if (isRepostPost(article)) return 'repost';
      const isReply = isReplyPost(article);
      const hasQuoted = hasQuotedTweet(article);
      if (isReply && hasQuoted) return 'quoted-reply';
      if (isReply) return 'reply';
      return 'original';
    };

    // 現在のページが /<handle>/following か判定
    const isOnFollowingPage = (): { isFollowing: boolean; ownerHandle?: string } => {
      const path = location.pathname;
      const m = path.match(/^\/([^/]+)\/following$/);
      if (m) return { isFollowing: true, ownerHandle: '@' + m[1] };
      return { isFollowing: false };
    };

    // 現在のページがプロフィールページか判定 (/<handle> or /<handle>/with_replies等)
    const isOnProfilePage = (): { isProfile: boolean; handle?: string } => {
      const path = location.pathname;
      // /home, /explore, /notifications, /messages, /settings, /i/* などを除外
      const m = path.match(/^\/([^/]+)(?:\/(?:with_replies|media|likes|highlights|articles))?$/);
      if (!m) return { isProfile: false };
      const reserved = ['home', 'explore', 'notifications', 'messages', 'settings', 'i', 'compose', 'search'];
      if (reserved.includes(m[1])) return { isProfile: false };
      return { isProfile: true, handle: '@' + m[1] };
    };

    // ========================================
    // 最終スコア合成: ヒューリスティック + ML + アカウント信号
    // ========================================
    const composeFinalScore = (
      heuristicScore: number | null,
      mlScore: number | null,
      accountScore: number,
    ): number => {
      const weights = currentSettings.engine?.weights ?? {};
      const heuristicEnabled = currentSettings.engine?.heuristicEnabled !== false;
      const mlEnabled = currentSettings.engine?.mlEnabled !== false;
      const accountEnabled = currentSettings.engine?.accountEnabled !== false;
     
      const entries: Array<{ score: number; weight: number }> = [];
     
      if (heuristicEnabled && typeof heuristicScore === 'number') {
        // ★ 修正: 0.35 → 0.20
        entries.push({ score: heuristicScore, weight: weights.heuristic ?? 0.20 });
      }
      if (mlEnabled && typeof mlScore === 'number') {
        // ★ 修正: 0.45 → 0.65
        entries.push({ score: mlScore, weight: weights.ml ?? 0.65 });
      }
      if (accountEnabled) {
        // ★ 修正: 0.2 → 0.15
        entries.push({ score: accountScore, weight: weights.account ?? 0.15 });
      }
     
      if (entries.length === 0) {
        return 0.5;
      }
     
      const totalWeight = entries.reduce(
        (s, e) => s + Math.max(0, e.weight),
        0,
      );
      if (totalWeight <= 0) {
        return entries.reduce((s, e) => s + e.score, 0) / entries.length;
      }
     
      return (
        entries.reduce((s, e) => s + e.score * Math.max(0, e.weight), 0) /
        totalWeight
      );
    };

    // ========================================
    // 最終カテゴリ判定: ヒューリスティック優先、次にML
    // ========================================
    const decideFinalCategory = (
      finalScore: number,
      heuristicResult: HeuristicResult | null,
      mlCategory: MlCategory | undefined,
    ): MlCategory => {
      // ヒューリスティックが明確に判定していればそれを最優先
      if (heuristicResult && heuristicResult.category !== 'mixed' && heuristicResult.signals.length >= 2) {
        return heuristicResult.category;
      }
      // 次にML
      if (mlCategory && mlCategory !== 'mixed') {
        return mlCategory;
      }
      // フォールバック: スコアから推定
      if (finalScore >= 0.7) return 'ai';
      if (finalScore >= 0.5) return 'mixed';
      return 'human';
    };

    const processArticle = async (article: HTMLElement) => {
      if (seen.has(article)) return;
      if (article.hasAttribute(PROCESSED_ATTR)) return;
      seen.add(article);

      const postId = extractPostId(article);
      const handle = extractHandle(article);
      const displayName = extractDisplayName(article);
      const text = extractText(article);
      const hasText = text.length > 0;

      if (!postId && !text && !handle) {
        return;
      }

      console.log('[AIPF/start]', {
        postId,
        handle,
        hasText,
        textPreview: text.slice(0, 60),
      });

      const isWL = isHandleInList(handle, currentSettings.whitelist);
      const isBL = isHandleInList(handle, currentSettings.blacklist);

      if (isBL) {
        article.setAttribute(PROCESSED_ATTR, '1');
        article.setAttribute('data-aipf-score', '1.000');
        article.setAttribute('data-aipf-category', 'ai');
        if (handle) article.setAttribute('data-aipf-handle', handle);
        applyViewToArticle(article, 1.0, 'ai', null, null, 1.0, handle, currentSettings);

        try {
          void chrome.runtime.sendMessage({
            type: 'stats/increment',
            payload: { checked: true, hidden: true },
          });
        } catch (e) {
          console.warn('[AIPF/stats] increment failed', e);
        }
        return;
      }

      if (isWL) {
        article.setAttribute(PROCESSED_ATTR, '1');
        article.setAttribute('data-aipf-score', '0.000');
        article.setAttribute('data-aipf-category', 'human');
        if (handle) article.setAttribute('data-aipf-handle', handle);
        applyViewToArticle(article, 0.0, 'human', null, null, 0.0, handle, currentSettings);

        try {
          void chrome.runtime.sendMessage({
            type: 'stats/increment',
            payload: { checked: true, hidden: false },
          });
        } catch (e) {
          console.warn('[AIPF/stats] increment failed', e);
        }
        return;
      }

      // ========================================
      // 1. ヒューリスティック (即座に実行・最速)
      // ========================================
      let heuristicResult: HeuristicResult | null = null;
      const heuristicEnabled = currentSettings.engine?.heuristicEnabled !== false;
      if (heuristicEnabled && hasText) {
        try {
          heuristicResult = analyzeHeuristic(text);
          console.log('[AIPF/heuristic]', {
            postId,
            score: heuristicResult.finalScore,
            category: heuristicResult.category,
            signalCount: heuristicResult.signals.length,
            topSignals: heuristicResult.signals.slice(0, 3).map((s) => s.rule),
          });
        } catch (e) {
          console.warn('[AIPF/heuristic] failed', e);
        }
      }

      // ========================================
      // 2. アカウント信号 (拡張: プロフィール情報を読み込み)
      // ========================================
      // 観察データを記録(fire-and-forget)
      if (handle) {
        const postType = detectPostType(article);
        void recordPostObservation(handle, postType);
      }

      // キャッシュされたプロフィール情報を取得
      const cachedProfile = handle ? await getUserProfile(handle) : null;

      const accountResult = analyzeAccountSignals({
        handle,
        displayName,
        recentPostTextSample: text,
        isReply: isReplyPost(article),
        isRepost: isRepostPost(article),
        // 拡張: プロフィール情報
        profile: cachedProfile
          ? {
              bioText: cachedProfile.bioText,
              bioDetectedLang: cachedProfile.bioDetectedLang,
              followingCount: cachedProfile.followingCount,
              followersCount: cachedProfile.followersCount,
              isFollowingByMe: cachedProfile.isFollowingByMe,
            }
          : undefined,
        // 拡張: 直近活動データ
        recentActivity: cachedProfile
          ? {
              replyCountLast1h: calcReplyCountWithinHours(cachedProfile, 1),
              replyCountLast24h: calcReplyCountWithinHours(cachedProfile, 24),
              ...calcQuotedReplyRatio(cachedProfile),
            }
          : undefined,
      });

      const rawAccountScore = accountResult.score;
      const effectiveAccountScore =
        accountResult.reasons.length === 0 ? 0.5 : rawAccountScore;

      console.log('[AIPF/account]', {
        postId,
        handle,
        score: effectiveAccountScore,
        category: accountResult.category,
        signalCount: accountResult.signals.length,
        topReasons: accountResult.reasons.slice(0, 3),
        hasProfile: !!cachedProfile,
      });

      // ========================================
      // 3. ML 推論
      // ========================================
      let mlScore: number | null = null;
      let mlResult: MlResult | null = null;

      const mlEnabled = currentSettings.engine?.mlEnabled !== false;

      if (mlEnabled && hasText && postId) {
        try {
          const response = (await chrome.runtime.sendMessage({
            type: 'ml/infer',
            payload: { postId, text },
          })) as unknown;

          const res = response as { result?: MlResult };
          if (res?.result) {
            mlResult = res.result;
            mlScore = typeof mlResult.score === 'number' ? mlResult.score : null;
          }
        } catch (error) {
          console.error('[AIPF/ml] error', { postId, error });
        }

        console.log('[AIPF/ml]', {
          postId,
          mlScore,
          mlCategory: mlResult?.category,
        });
      }

      // ========================================
      // 4. 合成
      // ========================================
      const heuristicScore = heuristicResult?.finalScore ?? null;
      const finalScore = composeFinalScore(heuristicScore, mlScore, effectiveAccountScore);
      const finalCategory = decideFinalCategory(finalScore, heuristicResult, mlResult?.category);

      article.setAttribute(PROCESSED_ATTR, '1');
      article.setAttribute('data-aipf-score', finalScore.toFixed(3));
      article.setAttribute('data-aipf-category', finalCategory);
      if (handle) article.setAttribute('data-aipf-handle', handle);

      if (mlResult) articleMlCache.set(article, mlResult);
      if (heuristicResult) articleHeuristicCache.set(article, heuristicResult);
      articleAccountScoreCache.set(article, effectiveAccountScore);

      applyViewToArticle(
        article,
        finalScore,
        finalCategory,
        mlResult,
        heuristicResult,
        effectiveAccountScore,
        handle,
        currentSettings,
      );

      console.log('[AIPF/final]', {
        postId,
        handle,
        finalScore,
        finalCategory,
        heuristic: heuristicScore,
        ml: mlScore,
        account: effectiveAccountScore,
      });

      const passThreshold =
        currentSettings.enabled && finalScore >= currentSettings.threshold;
      const willHide =
        passThreshold &&
        (currentSettings.viewMode === 'hide' ||
          currentSettings.viewMode === 'blur');

      try {
        void chrome.runtime.sendMessage({
          type: 'stats/increment',
          payload: {
            checked: true,
            hidden: willHide,
          },
        });
      } catch (e) {
        console.warn('[AIPF/stats] increment failed', e);
      }
    };

    // ========================================
    // フォローページ観察: /<handle>/following にいる時、表示中のユーザーをフォロー集合に登録
    // ========================================
    const observeFollowingPage = () => {
      const { isFollowing } = isOnFollowingPage();
      if (!isFollowing) return;

      // フォロー一覧の各ユーザーカードを走査
      const userCells = document.querySelectorAll<HTMLElement>(
        '[data-testid="UserCell"]',
      );
      userCells.forEach((cell) => {
        if (cell.hasAttribute('data-aipf-following-observed')) return;
        cell.setAttribute('data-aipf-following-observed', '1');

        // セル内のハンドル抽出
        const spans = cell.querySelectorAll<HTMLSpanElement>('span');
        for (const s of Array.from(spans)) {
          const t = s.textContent?.trim();
          if (t && t.startsWith('@')) {
            void addToFollowingSet(t);
            console.log('[AIPF/following] registered', { handle: t });
            break;
          }
        }
      });
    };

    // ========================================
    // プロフィールページ観察: フォロー数/フォロワー数/bioをキャッシュに保存
    // ========================================
    const observeProfilePage = () => {
      const { isProfile, handle } = isOnProfilePage();
      if (!isProfile || !handle) return;

      // プロフィールヘッダーのコンテナ
      const header = document.querySelector<HTMLElement>(
        '[data-testid="UserName"]',
      )?.closest('div[data-testid="primaryColumn"]') as HTMLElement | null;
      if (!header) return;

      if (header.hasAttribute('data-aipf-profile-observed')) return;
      header.setAttribute('data-aipf-profile-observed', '1');

      const extracted = extractProfileFromDOM(header);
      if (Object.keys(extracted).length === 0) return;

      void setUserProfile(handle, {
        ...extracted,
        fetchedAt: Date.now(),
      });
      console.log('[AIPF/profile] observed', { handle, ...extracted });
    };

    const scan = () => {
      const articles = document.querySelectorAll<HTMLElement>('article');
      articles.forEach((a) => {
        void processArticle(a);
      });
      // ページ種別に応じた観察
      observeFollowingPage();
      observeProfilePage();
    };

    const observer = new MutationObserver(() => {
      scan();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(scan, 1500);
  },
});
