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

  void warmupMlModel()
    .then((ok) => bgLog("warmupMlModel:", ok))
    .catch((e) => bgError("warmupMlModel error:", e));

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
