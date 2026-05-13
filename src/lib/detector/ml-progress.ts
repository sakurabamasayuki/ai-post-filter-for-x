export type MlBackend = 'webgpu' | 'wasm' | 'unknown';

export type MlProgressStage =
  | 'idle'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'inference'
  | 'error';

export interface MlProgressEvent {
  stage: MlProgressStage;
  modelId: string;
  modelVersion: string;
  backend: MlBackend;
  message: string;
  progress: number | null;
  loadedBytes: number | null;
  totalBytes: number | null;
  file: string | null;
  startedAt: number;
  updatedAt: number;
  durationMs: number;
  error: string | null;
}

export type MlProgressListener = (event: MlProgressEvent) => void;

const DEFAULT_EVENT: MlProgressEvent = {
  stage: 'idle',
  modelId: '',
  modelVersion: '',
  backend: 'unknown',
  message: 'idle',
  progress: null,
  loadedBytes: null,
  totalBytes: null,
  file: null,
  startedAt: 0,
  updatedAt: 0,
  durationMs: 0,
  error: null,
};

export class MlProgressEmitter {
  private listeners = new Set<MlProgressListener>();
  private snapshotValue: MlProgressEvent = { ...DEFAULT_EVENT };

  subscribe(listener: MlProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: MlProgressEvent): void {
    this.snapshotValue = event;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // no-op
      }
    }
  }

  snapshot(): MlProgressEvent {
    return { ...this.snapshotValue };
  }

  clear(): void {
    this.snapshotValue = { ...DEFAULT_EVENT };
  }
}

export const mlProgress = new MlProgressEmitter();

export function createMlProgressEvent(
  partial: Omit<
    Partial<MlProgressEvent>,
    'updatedAt' | 'durationMs'
  > & {
    stage: MlProgressStage;
    modelId: string;
    modelVersion: string;
    message: string;
  },
): MlProgressEvent {
  const now = Date.now();
  const startedAt = partial.startedAt ?? now;

  return {
    stage: partial.stage,
    modelId: partial.modelId,
    modelVersion: partial.modelVersion,
    backend: partial.backend ?? 'unknown',
    message: partial.message,
    progress: partial.progress ?? null,
    loadedBytes: partial.loadedBytes ?? null,
    totalBytes: partial.totalBytes ?? null,
    file: partial.file ?? null,
    startedAt,
    updatedAt: now,
    durationMs: Math.max(0, now - startedAt),
    error: partial.error ?? null,
  };
}
