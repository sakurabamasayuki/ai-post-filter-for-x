import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { db, type DailyStats } from "../../lib/db";

type ChartRow = {
  date: string;
  checked: number;
  hidden: number;
  overrides: number;
};

function buildLast30Days(rows: DailyStats[]): ChartRow[] {
  const map = new Map<string, DailyStats>();
  for (const r of rows) map.set(r.date, r);

  const out: ChartRow[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = map.get(key);
    out.push({
      date: key.slice(5), // MM-DD
      checked: row?.totalChecked ?? 0,
      hidden: row?.totalHidden ?? 0,
      overrides: row?.totalUserOverrides ?? 0,
    });
  }
  return out;
}

export function StatisticsTab(): JSX.Element {
  const [rows, setRows] = useState<ChartRow[]>([]);
  const [totals, setTotals] = useState({
    checked: 0,
    hidden: 0,
    overrides: 0,
  });

  const refresh = async () => {
    try {
      const stats = await db.getStatistics(30);
      const built = buildLast30Days(stats);
      setRows(built);

      const sum = built.reduce(
        (acc, r) => ({
          checked: acc.checked + r.checked,
          hidden: acc.hidden + r.hidden,
          overrides: acc.overrides + r.overrides,
        }),
        { checked: 0, hidden: 0, overrides: 0 }
      );
      setTotals(sum);
    } catch (e) {
      console.warn("[AIPF] stats load failed", e);
    }
  };

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, []);

  const accuracy =
    totals.checked > 0
      ? Math.max(0, 100 - (totals.overrides / totals.checked) * 100)
      : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="30日 チェック数" value={totals.checked} />
        <SummaryCard label="30日 非表示数" value={totals.hidden} />
        <SummaryCard label="30日 ユーザー訂正" value={totals.overrides} />
        <SummaryCard
          label="推定判定精度"
          value={accuracy === null ? "—" : `${accuracy.toFixed(1)}%`}
          hint="100 - (訂正数 / チェック数) で算出"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>過去30日の推移(チェック数 / 非表示数)</CardTitle>
          <CardDescription>
            タイムライン上で評価・フィルタされた投稿数の推移
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="checked"
                name="チェック数"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="hidden"
                name="非表示数"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ユーザー訂正の日別件数</CardTitle>
          <CardDescription>
            ユーザーが「やっぱり戻す」を行った件数 = モデル誤判定の目安
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
              />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Legend />
              <Bar
                dataKey="overrides"
                name="訂正数"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}): JSX.Element {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
        {hint && (
          <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}
