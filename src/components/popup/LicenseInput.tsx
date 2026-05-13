import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { UpgradeButton } from "./UpgradeButton";
import {
  saveAndValidateLicense,
  validateLicense,
  clearLicense,
  isExpired,
  daysUntilExpiry,
  type LicenseStatus,
} from "../../lib/license";

interface Props {
  licenseKey: string;
  onSave: (licenseKey: string) => void;
}

function formatExpiresAt(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function LicenseInput({ licenseKey, onSave }: Props): JSX.Element {
  const [input, setInput] = useState(licenseKey);
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error" | "info";
    text: string;
  } | null>(null);

  // 初回 + licenseKey 変更時にキャッシュから読み込み
  useEffect(() => {
    setInput(licenseKey);
    if (licenseKey.trim()) {
      void validateLicense(licenseKey).then(setStatus);
    } else {
      setStatus(null);
    }
  }, [licenseKey]);

  const showMessage = (
    kind: "ok" | "error" | "info",
    text: string,
    autoHide = true
  ) => {
    setMessage({ kind, text });
    if (autoHide) {
      window.setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleSave = async () => {
    const trimmed = input.trim();
    if (!trimmed) {
      showMessage("error", "ライセンスキーを入力してください");
      return;
    }

    setBusy(true);
    try {
      const next = await saveAndValidateLicense(trimmed);
      setStatus(next);
      onSave(trimmed);
      if (next.valid) {
        showMessage(
          "ok",
          `ライセンスが有効です(${next.plan.toUpperCase()})`
        );
      } else {
        showMessage("error", "ライセンスキーが無効です");
      }
    } catch (e) {
      console.error(e);
      showMessage("error", "検証に失敗しました(オフラインかもしれません)");
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    if (!licenseKey.trim()) {
      showMessage("error", "ライセンスキーが設定されていません");
      return;
    }
    setBusy(true);
    try {
      const next = await validateLicense(licenseKey, { force: true });
      setStatus(next);
      showMessage(
        next.valid ? "ok" : "error",
        next.valid ? "最新の状態を取得しました" : "ライセンスが無効です"
      );
    } catch {
      showMessage("error", "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm("ライセンスキーをクリアしますか?")) return;
    setBusy(true);
    try {
      await clearLicense();
      setInput("");
      setStatus(null);
      onSave("");
      showMessage("info", "ライセンスキーを削除しました");
    } finally {
      setBusy(false);
    }
  };

  const expired = status ? isExpired(status) : false;
  const remainingDays = status ? daysUntilExpiry(status) : null;
  const proActive = status?.valid && status.plan === "pro" && !expired;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          ライセンスキー
          {proActive && (
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
              PRO
            </Badge>
          )}
          {expired && (
            <Badge variant="destructive">期限切れ</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {proActive
            ? "Pro版が有効化されています"
            : "有料版のライセンスキーを入力して機能を有効化します"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {message && (
          <div
            className={
              "rounded-md border p-2 text-xs " +
              (message.kind === "ok"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : message.kind === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-sky-500/30 bg-sky-500/10 text-sky-300")
            }
          >
            {message.text}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="flex-1 font-mono text-xs"
            disabled={busy}
          />
          <Button onClick={handleSave} disabled={busy} size="sm">
            保存
          </Button>
        </div>

        {licenseKey.trim() && (
          <div className="flex gap-2">
            <Button
              onClick={handleRefresh}
              disabled={busy}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              ライセンスを更新
            </Button>
            <Button
              onClick={handleClear}
              disabled={busy}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              クリア
            </Button>
          </div>
        )}

        {status && (
          <div className="rounded-md border p-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">状態</span>
              <span className="font-semibold">
                {status.valid && !expired ? "有効" : "無効"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">プラン</span>
              <span className="font-semibold">{status.plan.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">期限</span>
              <span>{formatExpiresAt(status.expiresAt)}</span>
            </div>
            {remainingDays !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">残り</span>
                <span>{remainingDays}日</span>
              </div>
            )}
          </div>
        )}

        {!proActive && (
          <div className="pt-2 border-t">
            <UpgradeButton />
            {expired && (
              <p className="mt-2 text-xs text-red-300">
                ライセンスの有効期限が切れています。再購入をお願いします。
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
