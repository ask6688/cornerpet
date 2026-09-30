// Run after `npm run pack:mac`; losing screen space interrupts a real trackpad pinch.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PET, parsePetPackage, serializePetPackage } from '../shared/pet-config.mjs';
import { containPet, DEFAULT_FOOTPRINT } from '../desktop/layout.mjs';

const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const executablePath = process.env.CORNERPET_APP;
assert.ok(executablePath, 'Set CORNERPET_APP to the packaged executable');
const profile = await realpath(await mkdtemp(path.join(tmpdir(), 'cornerpet-resize-pinch-display-')));
const storage = path.join(profile, 'last-pet.cornerpet');
await writeFile(storage, serializePetPackage({ ...PET, scale: 1.25 }));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
let app;
try {
  app = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], env });
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
  const page = await app.firstWindow();
  await page.locator('.pet-grab').waitFor();
  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -8, cancelable: true })));
  await page.waitForFunction(() => (document.querySelector('.desktop-pet')?.getBoundingClientRect().width ?? 0) > 360, null, { polling: 16, timeout: 300 });
  assert.equal((await page.evaluate(() => window.cornerpet.getConfig())).scale, 1.25, 'the pinch is only a preview');

  const { removed, display } = await app.evaluate(({ screen }) => {
    const previous = screen.getPrimaryDisplay();
    const display = { ...previous, bounds: { ...previous.bounds, width: 350 }, workArea: { ...previous.workArea, width: 350 } };
    screen.getDisplayMatching = () => display;
    return { removed: screen.emit('display-removed', {}, previous), display };
  });
  assert.equal(removed, true, 'the display-removed listener ran');
  await page.waitForFunction(() => Math.abs((document.querySelector('.desktop-pet')?.getBoundingClientRect().width ?? 0) - 350) < 1);
  const view = await page.evaluate(() => window.cornerpet.getView());
  assert.equal(view.scale, 1.25);
  assert.equal((await page.evaluate(() => window.cornerpet.getConfig())).scale, 1.25);
  assert.equal(parsePetPackage(await readFile(storage, 'utf8')).scale, 1.25);
  await assert.rejects(page.evaluate(() => window.cornerpet.resizeCommit(1.35)), /调整已结束/);
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const area = { ...display.bounds, y: Math.max(display.bounds.y, display.workArea.y), height: display.bounds.y + display.bounds.height - Math.max(display.bounds.y, display.workArea.y) };
  const visual = { x: bounds.x + view.offset.x, y: bounds.y + view.offset.y };
  assert.deepEqual(visual, containPet(visual, area, DEFAULT_FOOTPRINT, 1.25), 'the pet remains visible');

  await page.waitForFunction(value => document.querySelector('.desktop-pet')?.style.transform === `translate(${value.offset.x}px, ${value.offset.y}px) scale(${value.scale})`, view);
  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 8, cancelable: true })));
  let saved = 0;
  for (let i = 0; i < 100; i++) {
    saved = (await page.evaluate(() => window.cornerpet.getConfig())).scale;
    if (saved === 1.15) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(saved, 1.15, 'another pinch starts from the displayed 125%');
  console.log('display removal cancelled a live pinch and the next pinch worked');
} finally {
  await app?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
