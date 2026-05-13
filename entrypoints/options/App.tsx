import React, { useEffect, useMemo, useState } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../src/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../src/components/ui/card";
import { Switch } from "../../src/components/ui/switch";
import { Label } from "../../src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../src/components/ui/select";
import { Separator } from "../../src/components/ui/separator";
import {
  storage,
  type AppSettings,
  applyTheme,
} from "../../src/lib/storage";

import { DetectionEngineTab } from "../../src/components/options/DetectionEngineTab";
import { ListManagementTab } from "../../src/components/options/ListManagementTab";
import { StatisticsTab } from "../../src/components/options/StatisticsTab";
import { FeedbackHistoryTab } from "../../src/components/options/FeedbackHistoryTab";
import { DataManagementTab } from "../../src/components/options/DataManagementTab";
import { AboutTab } from "../../src/components/options/AboutTab";

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeTab, setActiveTab] = useState("engine");

  useEffect(() => {
    let mounted = true;

    storage.getSettings().then((next) => {
      if (!mounted) return;
      setSettings(next);
      applyTheme(next.theme);
    });

    const unsubscribe = storage.onSettingsChanged((next) => {
      if (!mounted) return;
      setSettings(next);
      applyTheme(next.theme);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const version = useMemo(() => {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return "0.0.0";
    }
  }, []);

  const updateSettings = async (
    updater:
      | Partial<AppSettings>
      | ((prev: AppSettings) => Partial<AppSettings>)
  ): Promise<void> => {
    if (!settings) return;
    const patch = typeof updater === "function" ? updater(settings) : updater;
    const next = await storage.patchSettings(patch);
    setSettings(next);
    applyTheme(next.theme);
  };

  if (!settings) {
    return (
      <main className="min-h-screen bg-background text-foreground p-4">
        <div className="mx-auto max-w-6xl">
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              読み込み中...
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <Card className="border-border/60">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-xl md:text-2xl">
                  AI Post Filter for X
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  詳細設定 / デバッグ / データ管理
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <Switch
                    id="enabled"
                    checked={settings.enabled}
                    onCheckedChange={(checked) => {
                      void updateSettings({ enabled: checked });
                    }}
                    aria-label="拡張機能の有効化"
                  />
                  <Label htmlFor="enabled">有効</Label>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="theme-select" className="text-sm">
                    テーマ
                  </Label>
                  <Select
                    value={settings.theme}
                    onValueChange={(value: "system" | "light" | "dark") => {
                      void updateSettings({ theme: value });
                    }}
                  >
                    <SelectTrigger
                      id="theme-select"
                      className="w-[140px]"
                      aria-label="テーマ選択"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">System</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid h-auto w-full grid-cols-2 gap-2 md:grid-cols-6">
                <TabsTrigger value="engine">検出エンジン</TabsTrigger>
                <TabsTrigger value="lists">リスト管理</TabsTrigger>
                <TabsTrigger value="stats">統計</TabsTrigger>
                <TabsTrigger value="feedback">フィードバック</TabsTrigger>
                <TabsTrigger value="data">データ管理</TabsTrigger>
                <TabsTrigger value="about">About</TabsTrigger>
              </TabsList>

              <div className="mt-6">
                <TabsContent value="engine">
                  <DetectionEngineTab
                    settings={settings}
                    onChange={updateSettings}
                  />
                </TabsContent>

                <TabsContent value="lists">
                  <ListManagementTab
                    settings={settings}
                    onChange={updateSettings}
                  />
                </TabsContent>

                <TabsContent value="stats">
                  <StatisticsTab />
                </TabsContent>

                <TabsContent value="feedback">
                  <FeedbackHistoryTab />
                </TabsContent>

                <TabsContent value="data">
                  <DataManagementTab />
                </TabsContent>

                <TabsContent value="about">
                  <AboutTab version={version} />
                </TabsContent>
              </div>
            </Tabs>
          </CardHeader>
        </Card>
      </div>
    </main>
  );
}
