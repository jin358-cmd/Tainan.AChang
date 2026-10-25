const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const csp = config.headers[0].headers.find(header => header.key === 'Content-Security-Policy').value;

test('MapLibre worker CSP is narrow and does not relax scripts', () => {
  assert.match(csp, /(?:^|; )worker-src 'self' blob:(?:;|$)/);
  assert.match(csp, /(?:^|; )script-src 'self' https:\/\/cdn\.jsdelivr\.net(?:;|$)/);
  assert.doesNotMatch(csp, /script-src[^;]*blob:/);
  assert.doesNotMatch(csp, /(?:script-src|default-src)[^;]*'unsafe-eval'/);
});

test('map startup has bounded failure, cleanup and retry guards', () => {
  assert.match(app, /MAP_LOAD_TIMEOUT_MS=8000/);
  assert.match(app, /function teardownMap\(\)/);
  assert.match(app, /current\.remove\(\)/);
  assert.match(app, /attempt!==mapAttempt\|\|instance!==map/);
  assert.match(app, /if\(!mapLoaded&&fatalMapStartupError\(message\)\)/);
  assert.match(app, /function mapFailureLabel\(message\)/);
  assert.match(app, /data-retry-map/);
  assert.match(app, /function retryMap\(\)/);
  assert.doesNotMatch(html, /<script[^>]+src="https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl/);
  assert.doesNotMatch(html, /<link[^>]+href="https:\/\/cdn\.jsdelivr\.net\/npm\/maplibre-gl/);
  assert.match(app, /function loadMapStyles\(\)/);
  assert.match(app, /document\.head\.append\(script\)/);
});

test('map asset revision and service-worker cache advance together', () => {
  assert.match(html, /styles\.css\?v=187/);
  assert.match(html, /app\.js\?v=187/);
  assert.match(sw, /achang-pwa-shell-v120-member-application-layer/);
});
