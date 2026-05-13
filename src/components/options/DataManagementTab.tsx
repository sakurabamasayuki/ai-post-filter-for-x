import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { db, type ExportData } from "../../lib/db";

type Stats = {
  posts: number;
  accounts: number;
  feedback: number;
  statistics: number;
};

function downloadJson(filename: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function DataManagementTab(): JSX.Element {
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // 確認ダイアログ
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const showMessage = (kind: "ok" | "error", text: string) => {
    setMessage({ kind, text });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const refreshStats = useCallback(async () => {
    try {
      const [posts, accounts, feedback, statistics] = await Promise.all([
        db.posts.count(),
        db.accounts.count(),
        db.userFeedback.count(),
        db.statistics.count(),
      ]);
      setStats({ posts, accounts, feedback, statistics });
    } catch (e) {
      console.warn("[AIPF] count failed", e);
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const openConfirm = (config: NonNullable<typeof confirmConfig>) => {
    setConfirmConfig(config);
    setConfirmOpen(true);
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      const data = await db.exportAll();
      const filename = `aipf-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      downloadJson(filename, data);
      showMessage("ok", `エクスポートしました: ${filename}`);
    } catch (e) {
      console.error(e);
      showMessage("error", "エクスポートに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportSelect = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;

    openConfirm({
      title: "データをインポートしますか?",
      description: `${file.name} の内容を現在のデータに追加します。既存データは保持されます(同じキーは上書き)。`,
      confirmLabel: "インポートする",
      onConfirm: async () => {
        setBusy(true);
        try {
          const text = await file.text();
          const data = JSON.parse(text) as ExportData;

          if (
            !data ||
            !Array.isArray(data.posts) ||
            !Array.isArray(data.accounts) ||
            !Array.isArray(data.feedback) ||
            !Array.isArray(data.stats)
          ) {
            throw new Error("不正なフォーマットです");
          }

          await db.importAll(data);
          await refreshStats();
          showMessage("ok", "インポートが完了しました");
        } catch (e) {
          console.error(e);
          showMessage(
            "error",
            "インポートに失敗しました(JSON が正しいか確認してください)"
          );
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleCleanupOld = () => {
    openConfirm({
      title: "古いキャッシュを削除しますか?",
      description: "30日以上前の投稿スコアキャッシュを削除します。設定・ホワイト/ブラックリスト・フィードバックは削除されません。",
      confirmLabel: "削除する",
      onConfirm: async () => {
        setBusy(true);
        try {
          const removed = await db.cleanup(30);
          await refreshStats();
          showMessage("ok", `${removed}件のキャッシュを削除しました`);
        } catch (e) {
          console.error(e);
          showMessage("error", "削除に失敗しました");
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleClearPosts = () => {
    openConfirm({
      title: "投稿スコアキャッシュを全削除しますか?",
      description: "すべての投稿スコアキャッシュを削除します。次回タイムラインを開いた時に再判定されます。",
      confirmLabel: "全削除する",
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          await db.posts.clear();
          await refreshStats();
          showMessage("ok", "投稿スコアキャッシュを全削除しました");
        } catch (e) {
          console.error(e);
          showMessage("error", "削除に失敗しました");
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleClearAll = () => {
    openConfirm({
      title: "すべての DB データを削除しますか?",
      description: "投稿スコア・アカウント評価・フィードバック・統計のすべてを削除します。設定(ホワイトリスト等)は削除されません。",
      confirmLabel: "すべて削除する",
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          await Promise.all([
            db.posts.clear(),
            db.accounts.clear(),
            db.userFeedback.clear(),
            db.statistics.clear(),
          ]);
          await refreshStats();
          showMessage("ok", "すべてのデータを削除しました");
        } catch (e) {
          console.error(e);
          showMessage("error", "削除に失敗しました");
        } finally {
          setBusy(false);
        }
      },
    });
  };

  return (
    <div className="grid gap-4">
      {message && (
        <div
          className={
            "rounded-lg border p-3 text-sm " +
            (message.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300")
          }
        >
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ストレージ統計</CardTitle>
          <CardDescription>
            現在 IndexedDB に保存されているレコード数
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <StatBadge label="投稿スコア" value={stats?.posts ?? "—"} />
            <StatBadge label="アカウント評価" value={stats?.accounts ?? "—"} />
            <StatBadge
              label="フィードバック"
              value={stats?.feedback ?? "—"}
            />
            <StatBadge label="統計" value={stats?.statistics ?? "—"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>エクスポート / インポート</CardTitle>
          <CardDescription>
            すべての DB データを JSON 形式で書き出し・取り込みできます
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleExport()} disabled={busy}>
              JSON エクスポート
            </Button>
            <Button
              variant="outline"
              onClick={handleImportClick}
              disabled={busy}
            >
              JSON インポート
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportSelect}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            ※ エクスポートしたファイルはバックアップ用途のほか、別端末への移行にも使えます。
          </p>
        </CardContent>
      </Card>

      <Card className="border-red-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            危険ゾーン
            <Badge variant="destructive">Danger</Badge>
          </CardTitle>
          <CardDescription>
            データ削除操作。元に戻せないので、必要に応じて先にエクスポートしてください。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="text-sm">
              <div className="font-semibold">古いキャッシュのみ削除</div>
              <div className="text-xs text-muted-foreground">
                30日以上前の投稿スコアキャッシュだけ削除
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleCleanupOld}
              disabled={busy}
            >
              30日より古いを削除
            </Button>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="text-sm">
              <div className="font-semibold">投稿スコアキャッシュを全削除</div>
              <div className="text-xs text-muted-foreground">
                次回タイムライン読込時に再判定されます
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleClearPosts}
              disabled={busy}
            >
              投稿キャッシュ削除
            </Button>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <div className="text-sm">
              <div className="font-semibold text-red-300">
                全 DB データを削除
              </div>
              <div className="text-xs text-muted-foreground">
                投稿・アカウント・フィードバック・統計のすべて(設定は残ります)
              </div>
            </div>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              disabled={busy}
            >
              すべて削除
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmConfig?.title}</DialogTitle>
            <DialogDescription>
              {confirmConfig?.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              キャンセル
            </Button>
            <Button
              variant={confirmConfig?.danger ? "destructive" : "default"}
              onClick={async () => {
                if (confirmConfig) {
                  await confirmConfig.onConfirm();
                }
                setConfirmOpen(false);
              }}
              disabled={busy}
            >
              {confirmConfig?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatBadge({
  label,
  value,
}: {
  label: string;
  value: number | string;
}): JSX.Element {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
