const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const password = randomBytes(24).toString('hex');
let data, assets, child, base, cookie, feedbackId;

async function start() {
  child = spawn(process.execPath, ['server.js'], {
    cwd: repo,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', GEONATURE_DATA_DIR: data, GEONATURE_ADMIN_PANEL_PASSWORD: password },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Test server did not start')), 10000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Test server exited: ' + code)); });
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
}
async function api(route, body, expected = 200, extra = {}) {
  const response = await fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra.headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
    ...extra,
  });
  assert.equal(response.status, expected, route);
  return { response, value: await response.json() };
}
before(async () => {
  data = await fs.mkdtemp(path.join(os.tmpdir(), 'geonature-server-test-'));
  assets = await fs.mkdtemp(path.join(repo, 'assets', 'regression-'));
  await start();
});
after(async () => {
  await stop();
  if (assets) await fs.rm(assets, { recursive: true, force: true });
  if (data) await fs.rm(data, { recursive: true, force: true });
});

test('public pages and assets remain usable while private source is denied', async () => {
  for (const route of ['/', '/css/responsive.css', '/js/wildlife-rules.js', '/assets/icons/icon-192.png']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.arrayBuffer()).byteLength > 100);
  }
  for (const route of ['/.git/config', '/%2egit/config', '/server.js', '/package.json', '/.env', '/users.json', '/feedback.json']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
  const head = await fetch(base + '/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('public symlinks cannot expose a file outside the checkout', async () => {
  await fs.writeFile(path.join(data, 'private.html'), 'Private fixture');
  await fs.symlink(path.join(data, 'private.html'), path.join(assets, 'outside.html'));
  await fs.writeFile(path.join(assets, 'public.html'), '<!doctype html><title>Public fixture</title>');
  const prefix = '/assets/' + path.basename(assets);
  assert.equal((await fetch(base + prefix + '/outside.html')).status, 404);
  assert.equal((await fetch(base + prefix + '/public.html')).status, 200);
});

test('symlinks inside the checkout obey the same private-path rules as direct requests', async () => {
  const prefix = '/assets/' + path.basename(assets);
  await fs.symlink(path.join(repo, 'server.js'), path.join(assets, 'internalprivate.html'));
  await fs.symlink(path.join(repo, '.env.example'), path.join(assets, 'configuration.html'));
  await fs.symlink(path.join(assets, 'public.html'), path.join(assets, 'alias.html'));
  await fs.symlink(path.join(repo, 'js', 'common.js'), path.join(assets, 'script-alias.html'));
  assert.equal((await fetch(base + prefix + '/internalprivate.html')).status, 404);
  assert.equal((await fetch(base + prefix + '/internalprivate.html', { method: 'HEAD' })).status, 404);
  assert.equal((await fetch(base + prefix + '/configuration.html')).status, 404);
  assert.equal((await fetch(base + prefix + '/alias.html')).status, 200);
  const script = await fetch(base + prefix + '/script-alias.html');
  assert.equal(script.status, 200);
  assert.equal(script.headers.get('content-type'), 'application/javascript; charset=utf-8');
});

test('feedback validates fields and reaches the authenticated admin inbox', async () => {
  await api('/api/feedback', { message: ' ' }, 400);
  await api('/api/feedback', { message: 'test', email: 'invalid-address' }, 400);
  await api('/api/admin/feedback', undefined, 401);
  const saved = await api('/api/feedback', { visitorId: 'node_test_visitor_123', category: 'bug', message: 'Regression report', page: '/fishing.html' }, 201);
  feedbackId = saved.value.id;
  assert.equal(saved.value.ok, true);
  assert.ok(feedbackId);
  const login = await api('/api/admin/login', { password });
  cookie = login.response.headers.get('set-cookie').split(';')[0];
  const inbox = await api('/api/admin/feedback');
  assert.equal(inbox.value.items.find(item => item.id === feedbackId).message, 'Regression report');
});

test('admin feedback status is stored and survives a server restart', async () => {
  await api('/api/admin/feedback/status', { id: feedbackId, status: 'resolved' }, 200, { method: 'PATCH' });
  await stop();
  await start();
  const inbox = await api('/api/admin/feedback');
  assert.equal(inbox.value.items.find(item => item.id === feedbackId).status, 'resolved');
});

test('a failed feedback write returns an error without adding an in-memory report', async () => {
  const file = path.join(data, 'feedback.json');
  const backup = path.join(data, 'feedback.backup.json');
  await fs.rename(file, backup);
  await fs.mkdir(file);
  try {
    const failed = await api('/api/feedback', { visitorId: 'node_disk_failure_123', message: 'Must not be acknowledged or stored' }, 503);
    assert.equal(failed.value.ok, false);
    const inbox = await api('/api/admin/feedback');
    assert.ok(!inbox.value.items.some(item => item.message === 'Must not be acknowledged or stored'));
  } finally {
    await fs.rm(file, { recursive: true });
    await fs.rename(backup, file);
  }
});

test('feedback throttling rejects a sixth report from the same visitor', async () => {
  for (let i = 0; i < 5; i++) await api('/api/feedback', { visitorId: 'node_rate_limit_1234', message: 'Rate-limit fixture ' + i }, 201);
  const limited = await api('/api/feedback', { visitorId: 'node_rate_limit_1234', message: 'Sixth fixture' }, 429);
  assert.equal(limited.value.ok, false);
});
