import { defineConfig } from "wxt";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  entrypoints: [
    'entrypoints/background.ts',
    'entrypoints/content.ts',
    'entrypoints/options/index.tsx',
    'entrypoints/popup/index.tsx',
  ],
  webExt: {
    disabled: true,
  },

  manifest: {
    name: "AI Post Filter for X",
    description:
      "Detect AI-generated posts in the X timeline and blur, hide, or label them.",
    version: "0.1.0",

    permissions: ["storage", "activeTab", "tabs", "scripting"],

    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },

    host_permissions: [
      "*://x.com/*",
      "*://*.x.com/*",
      "*://twitter.com/*",
      "*://*.twitter.com/*",
      "https://huggingface.co/*",
      "https://*.huggingface.co/*",
      "https://hf.co/*",
      "https://ai-post-filter-api-v2.ai-post-filter-dev.workers.dev/*",
    ],

    action: {
      default_title: "AI Post Filter for X",
    },

    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },

    browser_specific_settings: {
      gecko: {
        id: "ai-post-filter-for-x@example.com",
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
  },

  vite: () => ({
    resolve: {
      alias: {
        "@": srcDir,
      },
    },

    // shadow.css?inline 用
    assetsInclude: ["**/*.css?inline"],
  }),

  suppressWarnings: {
    firefoxDataCollection: true,
  },
});
