import React, { useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import type { AppSettings } from "../../lib/storage";

interface Props {
  settings: AppSettings;
  onChange: (
    updater:
      | Partial<AppSettings>
      | ((prev: AppSettings) => Partial<AppSettings>)
  ) => Promise<void> | void;
}

type ListKind = "whitelist" | "blacklist";

function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

function isValidHandle(handle: string): boolean {
  if (!handle) return false;
  // X のハンドル: 1-15 文字、英数字とアンダースコア
  return /^[a-zA-Z0-9_]{1,15}$/.test(handle);
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCsvLine(line: string): string[] {
  // 簡易 CSV パーサー(ダブルクォート対応)
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

export function ListManagementTab({ settings, onChange }: Props): JSX.Element {
  const [whitelistInput, setWhitelistInput] = useState("");
  const [blacklistInput, setBlacklistInput] = useState("");
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const csvWhitelistInputRef = useRef<HTMLInputElement>(null);
  const csvBlacklistInputRef = useRef<HTMLInputElement>(null);

  const showMessage = (kind: "ok" | "error", text: string) => {
    setMessage({ kind, text });
    window.setTimeout(() => setMessage(null), 4000);
  };

  const addHandle = async (kind: ListKind, raw: string) => {
    const handle = normalizeHandle(raw);
    if (!isValidHandle(handle)) {
      showMessage(
        "error",
        "ハンドル名が不正です(英数字・アンダースコア1〜15文字)"
      );
      return;
    }

    const currentList = settings[kind];
    if (currentList.includes(handle)) {
      showMessage("error", `既に登録済みです: @${handle}`);
      return;
    }

    // 反対側のリストに含まれていたら警告
    const otherKind: ListKind = kind === "whitelist" ? "blacklist" : "whitelist";
    if (settings[otherKind].includes(handle)) {
      showMessage(
        "error",
        `@${handle} は${
          otherKind === "whitelist" ? "ホワイト" : "ブラック"
        }リストに登録されています。先に削除してください。`
      );
      return;
    }

    await onChange({
      [kind]: [...currentList, handle],
    });
    showMessage("ok", `追加しました: @${handle}`);

    if (kind === "whitelist") setWhitelistInput("");
    else setBlacklistInput("");
  };

  const removeHandle = async (kind: ListKind, handle: string) => {
    await onChange({
      [kind]: settings[kind].filter((h) => h !== handle),
    });
    showMessage("ok", `削除しました: @${handle}`);
  };

  const clearList = async (kind: ListKind) => {
    if (
      !window.confirm(
        `${kind === "whitelist" ? "ホワイト" : "ブラック"}リストを全削除しますか?`
      )
    )
      return;
    await onChange({ [kind]: [] });
    showMessage("ok", "全削除しました");
  };

  const exportCsv = (kind: ListKind) => {
    const list = settings[kind];
    const filename = `${kind}_${new Date().toISOString().slice(0, 10)}.csv`;
    const header = "handle\n";
    const body = list.map((h) => `@${h}`).join("\n");
    downloadFile(filename, header + body, "text/csv;charset=utf-8");
    showMessage("ok", `エクスポートしました: ${filename}`);
  };

  const importCsv = async (kind: ListKind, file: File) => {
    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      // 1行目がヘッダー(handle, account, name など)ならスキップ
      const startIdx =
        lines[0] &&
        /^(handle|account|user|name|username)$/i.test(
          parseCsvLine(lines[0])[0] ?? ""
        )
          ? 1
          : 0;

      const handles: string[] = [];
      const errors: string[] = [];
      const seen = new Set(settings[kind]);

      for (let i = startIdx; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const raw = cols[0] ?? "";
        const handle = normalizeHandle(raw);

        if (!handle) continue;
        if (!isValidHandle(handle)) {
          errors.push(`行${i + 1}: ${raw}`);
          continue;
        }
        if (seen.has(handle)) continue;

        handles.push(handle);
        seen.add(handle);
      }

      if (handles.length === 0) {
        showMessage(
          "error",
          `インポート可能な行がありません${
            errors.length ? `(無効: ${errors.length}件)` : ""
          }`
        );
        return;
      }

      await onChange({
        [kind]: [...settings[kind], ...handles],
      });

      showMessage(
        "ok",
        `${handles.length}件追加しました${
          errors.length ? ` (スキップ: ${errors.length}件)` : ""
        }`
      );
    } catch (e) {
      console.error(e);
      showMessage("error", "CSVの読み込みに失敗しました");
    }
  };

  const handleCsvSelect = (kind: ListKind, ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (file) void importCsv(kind, file);
    ev.target.value = ""; // 同じファイルを再選択できるようにリセット
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

      <ListSection
        kind="whitelist"
        title="ホワイトリスト"
        description="ここに登録したアカウントは常に表示されます(フィルタ対象外)"
        accent="emerald"
        list={settings.whitelist}
        inputValue={whitelistInput}
        onInputChange={setWhitelistInput}
        onAdd={() => addHandle("whitelist", whitelistInput)}
        onRemove={(h) => removeHandle("whitelist", h)}
        onClearAll={() => clearList("whitelist")}
        onExport={() => exportCsv("whitelist")}
        onImportClick={() => csvWhitelistInputRef.current?.click()}
        csvInputRef={csvWhitelistInputRef}
        onCsvSelect={(ev) => handleCsvSelect("whitelist", ev)}
      />

      <ListSection
        kind="blacklist"
        title="ブラックリスト"
        description="ここに登録したアカウントは常に非表示になります"
        accent="red"
        list={settings.blacklist}
        inputValue={blacklistInput}
        onInputChange={setBlacklistInput}
        onAdd={() => addHandle("blacklist", blacklistInput)}
        onRemove={(h) => removeHandle("blacklist", h)}
        onClearAll={() => clearList("blacklist")}
        onExport={() => exportCsv("blacklist")}
        onImportClick={() => csvBlacklistInputRef.current?.click()}
        csvInputRef={csvBlacklistInputRef}
        onCsvSelect={(ev) => handleCsvSelect("blacklist", ev)}
      />
    </div>
  );
}

interface ListSectionProps {
  kind: ListKind;
  title: string;
  description: string;
  accent: "emerald" | "red";
  list: string[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (handle: string) => void;
  onClearAll: () => void;
  onExport: () => void;
  onImportClick: () => void;
  csvInputRef: React.RefObject<HTMLInputElement>;
  onCsvSelect: (ev: React.ChangeEvent<HTMLInputElement>) => void;
}

function ListSection({
  title,
  description,
  accent,
  list,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  onClearAll,
  onExport,
  onImportClick,
  csvInputRef,
  onCsvSelect,
}: ListSectionProps): JSX.Element {
  const accentClass =
    accent === "emerald"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
      : "bg-red-500/10 text-red-300 border-red-500/30";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {title}
              <Badge variant="outline" className={accentClass}>
                {list.length}件
              </Badge>
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onImportClick}>
              CSV インポート
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={list.length === 0}
            >
              CSV エクスポート
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClearAll}
              disabled={list.length === 0}
            >
              全削除
            </Button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onCsvSelect}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="@username"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd();
              }
            }}
            className="flex-1"
          />
          <Button onClick={onAdd}>追加</Button>
        </div>

        <Separator />

        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            登録されているアカウントはまだありません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ハンドル</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((handle) => (
                  <TableRow key={handle}>
                    <TableCell className="font-mono text-sm">
                      @{handle}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRemove(handle)}
                      >
                        削除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
