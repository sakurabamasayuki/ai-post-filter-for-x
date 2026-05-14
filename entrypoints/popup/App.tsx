import { useEffect, useMemo, useState, useCallback } from "react";
import {
  storage,
  DEFAULT_SETTINGS,
  applyTheme,
  type AppSettings,
  type ViewMode,
  type ThemeMode,
} from "../../src/lib/storage";
import { db, type DailyStats } from "../../src/lib/db";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../src/components/ui/card";
import { Button } from "../../src/components/ui/button";
import { StatCard } from "../../src/components/popup/StatCard";
import { SettingsSection } from "../../src/components/popup/SettingsSection";
import { LicenseInput } from "../../src/components/popup/LicenseInput";

type PopupStats = {
  checkedToday: number;
  hiddenToday: number;
  checkedTotal: number;
  hiddenTotal: number;
};

const ZERO_STATS: PopupStats = {
  checkedToday: 0,
  hiddenToday: 0,
  checkedTotal: 0,
  hiddenTotal: 0,
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 70;
  return Math.min(100, Math.max(50, Math.round(n)));
}

function thresholdToPercent(threshold: number | undefined): number {
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
    return 70;
  }

  // settings.threshold は 0〜1、UI では 50〜100 (%) で扱う
  const value = threshold > 1 ? threshold : threshold * 100;
  return clampPercent(value);
}

function percentToThreshold(percent: number): number {
  return clampPercent(percent) / 100;
}

async function loadPopupStats(): Promise<PopupStats> {
  try {
    const rows: DailyStats[] = await db.getStatistics(365);

    const today = todayKey();
    let checkedToday = 0;
    let hiddenToday = 0;
    let checkedTotal = 0;
    let hiddenTotal = 0;

    for (const row of rows) {
      const checked = Number(row?.totalChecked ?? 0);
      const hidden = Number(row?.totalHidden ?? 0);

      checkedTotal += checked;
      hiddenTotal += hidden;

      if (row?.date === today) {
        checkedToday += checked;
        hiddenToday += hidden;
      }
    }

    return { checkedToday, hiddenToday, checkedTotal, hiddenTotal };
  } catch (err) {
    console.warn("[AIPF] loadPopupStats failed", err);
    return { ...ZERO_STATS };
  }
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<PopupStats>(ZERO_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // settings.threshold (0〜1) を UI 用の percent (50〜100) に変換
  const thresholdPercent = useMemo(
    () => thresholdToPercent(settings.threshold),
    [settings.threshold]
  );

  // 統計情報を再読み込み
  const refreshStats = useCallback(async () => {
    try {
      const next = await loadPopupStats();
      setStats(next);
    } catch (e) {
      console.warn("[AIPF] refreshStats failed", e);
    }
  }, []);

  // 初回ロード + 設定変更の購読
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const s = await storage.getSettings();
        if (cancelled) return;

        setSettings(s);
        applyTheme(s.theme);
        await refreshStats();
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const unsub = storage.onSettingsChanged((next) => {
      setSettings(next);
      applyTheme(next.theme);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [refreshStats]);

  // 1.5秒ごとに統計情報をポーリング
  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshStats();
    }, 1500);

    return () => window.clearInterval(id);
  }, [refreshStats]);

  // background からの stats/updated 通知を受信
  useEffect(() => {
    const listener = (msg: unknown) => {
      if (
        msg &&
        typeof msg === "object" &&
        (msg as { type?: string }).type === "stats/updated"
      ) {
        void refreshStats();
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [refreshStats]);

  // popup がフォーカスされた時・再表示時に統計情報を更新
  useEffect(() => {
    const onFocus = () => void refreshStats();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshStats();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshStats]);

  const handleEnabledChange = async (enabled: boolean) => {
    try {
      const next = await storage.patchSettings({ enabled });
      setSettings(next);
    } catch (e) {
      console.error("[AIPF] patch settings failed", e);
    }
  };

  const handleViewModeChange = async (viewMode: ViewMode) => {
    try {
      const next = await storage.patchSettings({ viewMode });
      setSettings(next);
    } catch (e) {
      console.error("[AIPF] patch viewMode failed", e);
    }
  };

  // UI の percent (50〜100) を settings.threshold (0〜1) に変換
  const handleThresholdPreview = (percent: number) => {
    setSettings((prev) => ({
      ...prev,
      threshold: percentToThreshold(percent),
    }));
  };

  const handleThresholdCommit = async (percent: number) => {
    try {
      const next = await storage.patchSettings({
        threshold: percentToThreshold(percent),
      });
      setSettings(next);
    } catch (e) {
      console.error("[AIPF] patch threshold failed", e);
    }
  };

  const handleThemeChange = async (theme: ThemeMode) => {
    try {
      const next = await storage.patchSettings({ theme });
      setSettings(next);
      applyTheme(next.theme);
    } catch (e) {
      console.error("[AIPF] patch theme failed", e);
    }
  };

  const handleLicenseSave = async (licenseKey: string) => {
    try {
      const next = await storage.patchSettings({ licenseKey });
      setSettings(next);
    } catch (e) {
      console.error("[AIPF] save license failed", e);
    }
  };

  const handleOpenOptions = () => {
    try {
      const url = chrome.runtime.getURL("options.html");
      void chrome.tabs.create({ url, active: true });
    } catch (e) {
      console.error("[AIPF] failed to open options tab", e);
      chrome.runtime.openOptionsPage?.();
    }
  };

  if (loading) {
    return (
      <div className="w-[440px] min-h-[560px] bg-background text-foreground p-4">
        読み込み中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-[440px] min-h-[560px] bg-background text-foreground p-4">
        <div className="text-red-500">エラー: {error}</div>
      </div>
    );
  }

  return (
    <div className="w-[440px] min-h-[560px] bg-background text-foreground p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span>AI Post Filter for X</span>
              {/* ⭐ Beta バッジ */}
              <span className="bg-yellow-500/20 text-yellow-300 text-xs px-2 py-1 rounded-full font-semibold">
                Beta
              </span>
            </div>
            <span
              className={
                "text-xs px-2 py-1 rounded-full " +
                (settings.enabled
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-slate-500/20 text-slate-300")
              }
            >
              {settings.enabled ? "有効" : "無効"}
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ⭐ β版では統計情報を非表示 */}
          {/*
          <div className="grid grid-cols-2 gap-3">
            <StatCard title="今日のチェック数" value={stats.checkedToday} />
            <StatCard title="今日の非表示数" value={stats.hiddenToday} />
            <StatCard title="累計チェック数" value={stats.checkedTotal} />
            <StatCard title="累計非表示数" value={stats.hiddenTotal} />
          </div>
          */}

          {/* ⭐ 統計の代わりにステータスメッセージを表示 */}
          <div className="text-sm text-muted-foreground text-center py-3">
            🔍 AI判定システムが稼働中...
          </div>

          <SettingsSection
            settings={settings}
            thresholdPercent={thresholdPercent}
            onEnabledChange={handleEnabledChange}
            onViewModeChange={handleViewModeChange}
            onThresholdPreview={handleThresholdPreview}
            onThresholdCommit={handleThresholdCommit}
            onThemeChange={handleThemeChange}
          />

          <LicenseInput
            licenseKey={settings.licenseKey ?? ""}
            onSave={handleLicenseSave}
          />

          <Button className="w-full" onClick={handleOpenOptions}>
            詳細設定を開く
          </Button>

          <div className="text-xs text-muted-foreground text-center pt-2">
            v0.1.0 Beta ・{" "}
            <a
              href="https://example.com/feedback"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              フィードバックを送る
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}