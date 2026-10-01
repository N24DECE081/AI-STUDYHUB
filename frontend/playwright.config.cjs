const { defineConfig } = require('@playwright/test');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const directory = mkdtempSync(join(tmpdir(), 'studyhub-e2e-'));
module.exports = defineConfig({
  testDir: './tests', testMatch: '**/*.e2e.cjs', workers: 1, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:5183', trace: 'retain-on-failure' },
  webServer: [
    { command: '../apps/python-api/.venv/bin/python ../apps/python-api/run.py', url: 'http://127.0.0.1:5013/api/health', timeout: 30000,
      env: { STUDYHUB_NO_DOTENV: '1', STUDYHUB_AI_PROVIDER: 'local', STUDYHUB_DB_MODE: 'sqlite', STUDYHUB_PORT: '5013', STUDYHUB_DB_PATH: join(directory,'qa.db'), STUDYHUB_UPLOAD_DIR: join(directory,'uploads'), STUDYHUB_CORS_ORIGINS: 'http://127.0.0.1:5183', STUDYHUB_AUTH_RATE_LIMIT_PER_MINUTE: '10000', STUDYHUB_AUTH_BURST: '1000', STUDYHUB_API_RATE_LIMIT_PER_MINUTE: '10000', STUDYHUB_API_BURST: '1000' } },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5183 --strictPort', url: 'http://127.0.0.1:5183',
      env: { VITE_API_PROXY_TARGET: 'http://127.0.0.1:5013' } },
  ],
});
