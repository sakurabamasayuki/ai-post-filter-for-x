import {
  inferAiScoreWithModel,
  warmupMlModel,
  getCachedModelMeta,
  type MlInferenceInput,
  type MlInferenceOutput,
} from "../src/lib/detector/ml";
import { db } from "../src/lib/db";

function bgLog(...args: unknown[]): void {
  console.log("[AIPF/bg]", ...args);
}

function bgError(...args: unknown[]): void {
  console.error("[AIPF/bg]", ...args);
}

export default defineBackground(() => {
  bgLog("background started");

  // ローカルMLは無効化（Workers APIで代替）
  bgLog("local ML disabled, using Workers API instead");

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg !== "object") return false;

    // ===== ml/infer =====
    if (msg.type === "ml/infer") {
      (async () => {
        const postId = msg.payload?.postId ?? "unknown";
        const text = msg.payload?.text ?? "";

        bgLog("ml/infer start", {
          postId,
          textLength: text.length,
        });

        if (!text.trim()) {
          bgLog("ml/infer: empty text");
          sendResponse({ result: null });
          return;
        }

        try {
          const result = await inferAiScoreWithModel({ text });

          if (!result) {
            bgLog("ml/infer: result is null");
            sendResponse({ result: null });
            return;
          }

          // ★ デバッグ: category の値を確認
          bgLog("ml/infer DEBUG", {
            score: result.score,
            category: result.category,
            categoryScores: result.categoryScores,
          });

          const response = {
            result: {
              score: result.score,
              modelVersion: result.modelVersion,
              latencyMs: result.latencyMs,
              category: result.category,
              categoryScores: result.categoryScores,
              topMatches: result.topMatches,
              lengthConfidence: result.lengthConfidence,
            },
          };

          bgLog("ml/infer sendResponse", {
            score: result.score,
            category: result.category,
          });

          sendResponse(response);
        } catch (error) {
          bgError("ml/infer error", error);
          sendResponse({ result: null });
        }
      })();
      return true;
    }

    // ===== ml/warmup =====
    if (msg.type === "ml/warmup") {
      (async () => {
        try {
          const ok = await warmupMlModel();
          sendResponse({ ok });
        } catch (error) {
          bgError("ml/warmup error", error);
          sendResponse({ ok: false });
        }
      })();
      return true;
    }

    // ===== ml/meta =====
    if (msg.type === "ml/meta") {
      (async () => {
        try {
          const meta = await getCachedModelMeta();
          sendResponse({ meta });
        } catch (error) {
          bgError("ml/meta error", error);
          sendResponse({ meta: null });
        }
      })();
      return true;
    }
    
    // ===== api/detect =====
    if (msg.type === "api/detect") {
      (async () => {
        const text = msg.payload?.text ?? "";
        const licenseKey = msg.payload?.licenseKey;
        bgLog("api/detect REQUEST", {           
          textLength: text.length,              
          textPreview: text.slice(0, 50),       
          hasLicenseKey: !!licenseKey,          
        });                                     
        const WORKERS_API_URL = 'https://ai-post-filter-api-production.ai-post-filter-dev.workers.dev/api/detect';
        try {
          const response = await fetch(WORKERS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, licenseKey }),
          });
          const data = await response.json().catch(() => ({}));
          const remaining = response.headers.get('X-RateLimit-Remaining');
          const resetAt = response.headers.get('X-RateLimit-Reset');
          bgLog("api/detect response", { status: response.status, remaining });
          sendResponse({
            ok: response.ok,
            status: response.status,
            data,
            rateLimitInfo: {
              remaining: remaining ? parseInt(remaining, 10) : null,
              resetAt: resetAt ? parseInt(resetAt, 10) : null,
            },
          });
        } catch (error) {
          bgError("api/detect error", error);
          sendResponse({ ok: false, status: 0, error: 'network_error' });
        }
      })();
      return true;
    }
    
    // ===== stats/increment =====
    if (msg.type === "stats/increment") {
      (async () => {
        const checked = msg.payload?.checked ?? false;
        const hidden = msg.payload?.hidden ?? false;

        try {
          if (checked) {
            await db.incrementStat("totalChecked");
          }
          if (hidden) {
            await db.incrementStat("totalHidden");
          }

          bgLog("stats/increment success", { checked, hidden });
          sendResponse({ ok: true });
        } catch (error) {
          bgError("stats/increment error", error);
          sendResponse({ ok: false });
        }
      })();
      return true;
    }

    return false;
  });
});
