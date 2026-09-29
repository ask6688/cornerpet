import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const script = fileURLToPath(new URL('../scripts/install-macos.sh', import.meta.url));
const darwin = process.platform === 'darwin';

function fakeRelease(root, marker, { digest } = {}) {
  const stage = path.join(root, `stage-${marker}`);
  mkdirSync(path.join(stage, 'CornerPet.app/Contents/MacOS'), { recursive: true });
  writeFileSync(path.join(stage, 'CornerPet.app/Contents/MacOS/CornerPet'), `#!/bin/sh\n# ${marker}\n`, { mode: 0o755 });
  const dmg = path.join(root, `CornerPet-${marker}.dmg`);
  execFileSync('hdiutil', ['create', '-quiet', '-fs', 'HFS+', '-srcfolder', stage, '-format', 'UDZO', dmg]);
  // Browsers mark downloads; the installed app must still come out unquarantined.
  execFileSync('xattr', ['-w', 'com.apple.quarantine', '0083;00000000;Safari;', dmg]);
  const sha = createHash('sha256').update(readFileSync(dmg)).digest('hex');
  const api = path.join(root, `release-${marker}.json`);
  writeFileSync(api, JSON.stringify({ tag_name: marker, assets: [
    { name: `CornerPet-${marker}-arm64.zip`, browser_download_url: 'file:///nonexistent.zip', digest: 'sha256:0' },
    { name: `CornerPet-${marker}-arm64.dmg`, browser_download_url: pathToFileURL(dmg).href, digest: digest ?? `sha256:${sha}` },
  ] }));
  return pathToFileURL(api).href;
}

// The documented entry point is `curl … | bash`, so feed the script through stdin.
function install(args, env) {
  return spawnSync('bash', ['-s', '--', ...args], { input: readFileSync(script), env: { ...process.env, ...env }, encoding: 'utf8' });
}

const executable = appDir => readFileSync(path.join(appDir, 'CornerPet.app/Contents/MacOS/CornerPet'), 'utf8');
const quarantined = file => spawnSync('xattr', ['-p', 'com.apple.quarantine', file]).status === 0;

test('installs the verified release over an older copy without the quarantine flag', { skip: !darwin }, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cornerpet-install-'));
  try {
    const appDir = path.join(root, 'Applications');
    const env = { CORNERPET_APP_DIR: appDir };
    let result = install(['--no-open'], { ...env, CORNERPET_RELEASE_API: fakeRelease(root, 'v1') });
    assert.equal(result.status, 0, result.stderr);
    assert.match(executable(appDir), /v1/);
    result = install(['--no-open'], { ...env, CORNERPET_RELEASE_API: fakeRelease(root, 'v2') });
    assert.equal(result.status, 0, result.stderr);
    assert.match(executable(appDir), /v2/);
    assert.equal(quarantined(path.join(appDir, 'CornerPet.app')), false);
    assert.equal(quarantined(path.join(appDir, 'CornerPet.app/Contents/MacOS/CornerPet')), false);
    assert.equal(existsSync(path.join(appDir, 'CornerPet.app.installing')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('refuses a download whose SHA-256 differs from the release digest and keeps the old app', { skip: !darwin }, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cornerpet-install-'));
  try {
    const appDir = path.join(root, 'Applications');
    const env = { CORNERPET_APP_DIR: appDir };
    assert.equal(install(['--no-open'], { ...env, CORNERPET_RELEASE_API: fakeRelease(root, 'good') }).status, 0);
    for (const digest of [`sha256:${'0'.repeat(64)}`, '']) {
      const result = install(['--no-open'], { ...env, CORNERPET_RELEASE_API: fakeRelease(root, `bad${digest.length}`, { digest }) });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /校验/);
      assert.match(executable(appDir), /good/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('--fix only lifts the quarantine from an app that was dragged in from the DMG', { skip: !darwin }, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'cornerpet-install-'));
  try {
    const appDir = path.join(root, 'Applications');
    let result = install(['--fix', '--no-open'], { CORNERPET_APP_DIR: appDir });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /没有在/);
    const app = path.join(appDir, 'CornerPet.app');
    mkdirSync(path.join(app, 'Contents/MacOS'), { recursive: true });
    writeFileSync(path.join(app, 'Contents/MacOS/CornerPet'), '#!/bin/sh\n# dragged\n', { mode: 0o755 });
    for (const file of [app, path.join(app, 'Contents/MacOS/CornerPet')]) execFileSync('xattr', ['-w', 'com.apple.quarantine', '0083;00000000;Safari;', file]);
    // No network: --fix must not look up a release.
    result = install(['--fix', '--no-open'], { CORNERPET_APP_DIR: appDir, CORNERPET_RELEASE_API: 'file:///nonexistent.json' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(executable(appDir), /dragged/);
    assert.equal(quarantined(app), false);
    assert.equal(quarantined(path.join(app, 'Contents/MacOS/CornerPet')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('rejects unknown options before touching anything', { skip: !darwin }, () => {
  const result = install(['--yes'], { CORNERPET_APP_DIR: '/nonexistent', CORNERPET_RELEASE_API: 'file:///nonexistent.json' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /未知参数/);
});
