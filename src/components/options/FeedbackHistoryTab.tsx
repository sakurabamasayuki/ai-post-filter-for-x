import React, { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { db, type UserFeedback } from "../../lib/db";

function formatDate(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

export function FeedbackHistoryTab(): JSX.Element {
  const [rows, setRows] = useState<UserFeedback[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await db.userFeedback
        .orderBy("feedbackAt")
        .reverse()
        .limit(500)
        .toArray();
      setRows(all);
    } catch (e) {
      console.warn("[AIPF] feedback load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRevert = async (postId: string) => {
    try {
      await db.userFeedback.delete(postId);
      // スコアキャッシュも消すと次回再判定される
      try {
        await db.posts.delete(postId);
      } catch (e) {
        console.warn("[AIPF] post cache delete failed", e);
      }
      await refresh();
    } catch (e) {
      console.warn("[AIPF] revert failed", e);
    }
  };

  const filtered = rows.filter((r) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      r.postId.toLowerCase().includes(q) ||
      r.correctLabel.toLowerCase().includes(q)
    );
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>フィードバック履歴</CardTitle>
              <CardDescription>
                ユーザーが Human / AI を訂正した投稿の履歴(最新500件)
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="postId / ラベルで検索"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-[240px]"
              />
              <Button variant="outline" onClick={() => void refresh()}>
                再読み込み
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">
              読み込み中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              フィードバック履歴はまだありません。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日時</TableHead>
                    <TableHead>Post ID</TableHead>
                    <TableHead>訂正ラベル</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.postId}>
                      <TableCell className="text-xs tabular-nums">
                        {formatDate(row.feedbackAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.postId}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            row.correctLabel === "ai"
                              ? "destructive"
                              : "default"
                          }
                        >
                          {row.correctLabel === "ai" ? "AI" : "Human"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleRevert(row.postId)}
                        >
                          やっぱり戻す
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
    </div>
  );
}
