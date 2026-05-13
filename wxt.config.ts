import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['storage', 'webRequest'],
    host_permissions: [
      '<all_urls>',
      'https://*.workers.dev/*',
    ],
  },
});