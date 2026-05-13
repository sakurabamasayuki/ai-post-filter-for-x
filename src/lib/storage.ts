export type ViewMode = "blur" | "hide" | "label";
export type ThemeMode = "system" | "light" | "dark";

export interface DetectorWeights {
  heuristic: number;
  account: number;
  ml: number;
  remote: number;
}

export interface EngineSettings {
  heuristicEnabled: boolean;
  accountEnabled: boolean;
  mlEnabled: boolean;
  remoteEnabled: boolean;
  weights: DetectorWeights;
}

export interface AppSettings {
  enabled: boolean;
  viewMode: ViewMode;
  threshold: number;
  licenseKey: string;
  theme: ThemeMode;
  whitelist: string[];
  blacklist: string[];
  engine: EngineSettings;
}

const STORAGE_KEY = "appSettings";

// ★ 修正: 初期値を画像に合わせた (heuristic: 0.20, account: 0.15, ml: 0.65)
export const DEFAULT_SETTINGS: AppSettings = {
  enabled: true,
  viewMode: "blur",
  threshold: 0.7,
  licenseKey: "",
  theme: "system",
  whitelist: [],
  blacklist: [],
  engine: {
    heuristicEnabled: true,
    accountEnabled: true,
    mlEnabled: true,
    remoteEnabled: false,
    weights: {
      heuristic: 0.20,
      account: 0.15,
      ml: 0.65,
      remote: 0,
    },
  },
};

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.threshold;
  return Math.max(0.5, Math.min(1, value));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeSettings(input?: Partial<AppSettings> | null): AppSettings {
  const source = input ?? {};

  return {
    enabled:
      typeof source.enabled === "boolean"
        ? source.enabled
        : DEFAULT_SETTINGS.enabled,
    viewMode:
      source.viewMode === "blur" ||
      source.viewMode === "hide" ||
      source.viewMode === "label"
        ? source.viewMode
        : DEFAULT_SETTINGS.viewMode,
    threshold: clampThreshold(
      typeof source.threshold === "number"
        ? source.threshold
        : DEFAULT_SETTINGS.threshold
    ),
    licenseKey:
      typeof source.licenseKey === "string"
        ? source.licenseKey
        : DEFAULT_SETTINGS.licenseKey,
    theme:
      source.theme === "system" ||
      source.theme === "light" ||
      source.theme === "dark"
        ? source.theme
        : DEFAULT_SETTINGS.theme,
    whitelist: normalizeStringArray(source.whitelist),
    blacklist: normalizeStringArray(source.blacklist),
    engine: {
      heuristicEnabled:
        typeof source.engine?.heuristicEnabled === "boolean"
          ? source.engine.heuristicEnabled
          : DEFAULT_SETTINGS.engine.heuristicEnabled,
      accountEnabled:
        typeof source.engine?.accountEnabled === "boolean"
          ? source.engine.accountEnabled
          : DEFAULT_SETTINGS.engine.accountEnabled,
      mlEnabled:
        typeof source.engine?.mlEnabled === "boolean"
          ? source.engine.mlEnabled
          : DEFAULT_SETTINGS.engine.mlEnabled,
      remoteEnabled:
        typeof source.engine?.remoteEnabled === "boolean"
          ? source.engine.remoteEnabled
          : DEFAULT_SETTINGS.engine.remoteEnabled,
      weights: {
        heuristic:
          typeof source.engine?.weights?.heuristic === "number"
            ? source.engine.weights.heuristic
            : DEFAULT_SETTINGS.engine.weights.heuristic,
        account:
          typeof source.engine?.weights?.account === "number"
            ? source.engine.weights.account
            : DEFAULT_SETTINGS.engine.weights.account,
        ml:
          typeof source.engine?.weights?.ml === "number"
            ? source.engine.weights.ml
            : DEFAULT_SETTINGS.engine.weights.ml,
        remote:
          typeof source.engine?.weights?.remote === "number"
            ? source.engine.weights.remote
            : DEFAULT_SETTINGS.engine.weights.remote,
      },
    },
  };
}

type SettingsChangeListener = (settings: AppSettings) => void;

async function readStoredSettings(): Promise<Partial<AppSettings> | null> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];

  if (!raw || typeof raw !== "object") {
    return null;
  }

  return raw as Partial<AppSettings>;
}

async function writeStoredSettings(settings: AppSettings): Promise<void> {
  await chrome.storage.sync.set({
    [STORAGE_KEY]: settings,
  });
}

export function applyTheme(
  theme: ThemeMode,
  root: HTMLElement = document.documentElement
): void {
  const isDarkSystem =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const resolved =
    theme === "system" ? (isDarkSystem ? "dark" : "light") : theme;

  root.classList.remove("light", "dark");
  root.classList.add(resolved);
}

export const storage = {
  async getSettings(): Promise<AppSettings> {
    const stored = await readStoredSettings();
    return mergeSettings(stored);
  },

  async setSettings(next: AppSettings): Promise<AppSettings> {
    const merged = mergeSettings(next);
    await writeStoredSettings(merged);
    return merged;
  },

  async patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await readStoredSettings();
    const merged = mergeSettings({
      ...(current ?? {}),
      ...patch,
      engine: {
        ...((current?.engine as EngineSettings | undefined) ??
          DEFAULT_SETTINGS.engine),
        ...(patch.engine ?? {}),
        weights: {
          ...(((current?.engine as EngineSettings | undefined)?.weights ??
            DEFAULT_SETTINGS.engine.weights) as DetectorWeights),
          ...(patch.engine?.weights ?? {}),
        },
      },
    });

    await writeStoredSettings(merged);
    return merged;
  },

  onSettingsChanged(listener: SettingsChangeListener): () => void {
    const handler = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "sync") return;
      if (!changes[STORAGE_KEY]) return;

      const nextValue = changes[STORAGE_KEY].newValue as
        | Partial<AppSettings>
        | undefined;

      listener(mergeSettings(nextValue));
    };

    chrome.storage.onChanged.addListener(handler);

    return () => {
      chrome.storage.onChanged.removeListener(handler);
    };
  },
};