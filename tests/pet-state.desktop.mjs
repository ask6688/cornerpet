// npm run build; PLAYWRIGHT_MODULE can point to the existing tool installation.
// Isolated Electron profile: never overwrites the user's companion or needs OS lock permissions.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { PET, normalizePetConfig, serializePetPackage } from '../shared/pet-config.mjs';
import { buildConnectUrl, HANDOFF_URL } from '../shared/desktop-connect.mjs';
import { DEMO_FACE_RIGS } from '../shared/image-face-rigs.mjs';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { default: executablePath } = await import('electron');
const profile = await mkdtemp(`${tmpdir()}/cornerpet-state-`);
// Bootstrap lives beside node_modules so Node can resolve Electron.
const entry = `${process.cwd()}/.pet-state-check-${process.pid}.mjs`;
await writeFile(entry, `import { app } from 'electron'; app.setPath('userData', ${JSON.stringify(profile)}); await import(${JSON.stringify(pathToFileURL(`${process.cwd()}/desktop/main.mjs`).href)});`);
let app, savedPath, backup;
try {
  app = await _electron.launch({ executablePath: process.env.CORNERPET_APP || executablePath, args: process.env.CORNERPET_APP ? [] : [entry] });
  const dataDirectory = await app.evaluate(({ app }) => app.getPath('userData'));
  savedPath = `${dataDirectory}/last-pet.cornerpet`;
  try { backup = await readFile(savedPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const modelFile = `${profile}/state-3d.cornerpet`;
  await writeFile(modelFile, serializePetPackage(PET));
  await app.evaluate(({ app }, file) => app.emit('open-file', { preventDefault() {} }, file), modelFile);
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.pet-3d canvas').waitFor();
  const osIdle = await app.evaluate(({ powerMonitor }) => powerMonitor.getSystemIdleTime());
  assert.ok(Number.isFinite(osIdle) && osIdle >= 0, 'real OS idle reading available');
  // Substitute only idle seconds, keep the real main-process poll, IPC, renderer and WebGL.
  const idle = seconds => app.evaluate(({ powerMonitor }, seconds) => { powerMonitor.getSystemIdleTime = () => seconds; }, seconds);
  const state = expected => page.waitForFunction(expected => document.querySelector('.desktop-pet')?.getAttribute('data-state') === expected, expected);
  await idle(0);
  await state('active');
  await idle(120);
  await state('short-idle');
  assert.equal(await page.locator('.pet-3d').getAttribute('data-face-mood'), 'peek');
  await idle(601);
  await state('sleep');
  assert.equal(await page.locator('.pet-3d').getAttribute('data-face-mood'), 'sleepy');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'output/playwright/state-3d-sleep.png', omitBackground: true });
  await idle(0);
  await state('welcome-back');
  await page.waitForTimeout(220);
  assert.match(await page.locator('.pet-bubble').textContent(), /你回来啦/);
  await page.screenshot({ path: 'output/playwright/state-3d-wake.png', omitBackground: true });
  await state('active');

  const imageFile = `${profile}/state-image.cornerpet`;
  const image2D = `data:image/png;base64,${(await readFile('public/examples/mochi-sprout.png')).toString('base64')}`;
  await writeFile(imageFile, serializePetPackage(normalizePetConfig({ ...PET, model3D: null, image2D, faceRig: DEMO_FACE_RIGS.mochi, source: 'upload', style: 'mochi' })));
  await app.evaluate(({ app }, file) => app.emit('open-file', { preventDefault() {} }, file), imageFile);
  await page.locator('.image-pet-face').waitFor();
  const original = await page.evaluate(() => window.cornerpet.getConfig());
  await idle(601);
  await state('sleep');
  assert.equal(await page.locator('.image-pet-face').getAttribute('data-face-mood'), 'sleepy');
  assert.equal(await page.locator('.pet-zzz').count(), 1);
  await page.screenshot({ path: 'output/playwright/state-image-sleep.png', omitBackground: true });
  await idle(0);
  await page.locator('.pet-grab').press('Enter');
  await state('welcome-back');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'output/playwright/state-image-wake.png', omitBackground: true });
  await state('active');
  const reactions = [];
  for (let i = 0; i < 3; i++) {
    await page.locator('.pet-grab').press('Enter');
    await page.waitForTimeout(120);
    const reaction = await page.locator('.image-pet').getAttribute('data-reaction');
    assert.ok(reaction && reaction !== reactions.at(-1)); reactions.push(reaction);
  }
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'));
  await state('sleep');
  await page.locator('.pet-grab').press('Enter');
  await state('sleep');
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'));
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  await state('sleep');
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('unlock-screen'));
  await state('welcome-back');
  await state('active');
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'));
  await state('sleep');
  await idle(700);
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'));
  await state('sleep');
  await idle(0);
  await state('welcome-back');
  assert.deepEqual(await page.evaluate(() => window.cornerpet.getConfig()), original, 'behavior never edits saved identity/appearance');
  const saved = JSON.parse(await readFile(savedPath, 'utf8')).pet;
  assert.equal(saved.name, original.name);
  assert.equal('presence' in saved, false);
  if (process.env.CORNERPET_APP) {
    // Real packaged loopback adoption: desktop sizing belongs to this runtime,
    // even when the Web copy of the same pet carries an older scale.
    const origin = 'http://127.0.0.1:5173', token = 'b'.repeat(64);
    await app.evaluate(({ app }, url) => app.emit('open-url', { preventDefault() {} }, url), buildConnectUrl({ origin, token }));
    await page.evaluate(() => window.cornerpet.setScale(.75));
    const updated = normalizePetConfig({ ...original, name: '又见面', scale: 1.35 });
    const response = await fetch(HANDOFF_URL, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: serializePetPackage(updated) });
    assert.equal(response.status, 200);
    await page.waitForFunction(() => document.title.startsWith('又见面'));
    const received = await page.evaluate(() => window.cornerpet.getConfig());
    assert.deepEqual(received, { ...updated, scale: .75 });
    assert.equal((await page.evaluate(() => window.cornerpet.getView())).scale, .75);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ osIdleAvailable: true, renderers: ['3d', 'image'], sleepWake: true, clickReactions: reactions, lockSuspendPriority: true, savedPetUnchanged: true, samePetSizePreserved: Boolean(process.env.CORNERPET_APP), errors }));
} finally {
  if (app) await app.close();
  if (savedPath) {
    if (backup) await writeFile(savedPath, backup, { mode: 0o600 });
    else await rm(savedPath, { force: true });
  }
  await rm(entry, { force: true });
  await rm(profile, { recursive: true, force: true });
}
