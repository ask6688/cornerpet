// Run after `npm run pack:mac`:
//   CORNERPET_APP=release/mac-arm64/CornerPet.app/Contents/MacOS/CornerPet PLAYWRIGHT_MODULE=… node tests/pinch-resize.desktop.mjs
// Uses a throwaway data folder, so an installed CornerPet can keep running and its pet is never touched.
import assert from 'node:assert/strict';
import { randomFillSync } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { createPetModel, parsePetPackage, serializePetPackage } from '../shared/pet-config.mjs';
import { anchoredPetBounds, imageFootprint, resizeAnchor } from '../desktop/layout.mjs';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const executablePath = process.env.CORNERPET_APP;
assert.ok(executablePath, 'Set CORNERPET_APP to the packaged executable');
const data = await mkdtemp(path.join(tmpdir(), 'cornerpet-pinch-'));
const files = { pet: path.join(data, 'last-pet.cornerpet'), hint: path.join(data, 'resize-hint.json') };
// Electron-based editors export this, and it would start the app as plain Node.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'));
// One focused two-finger pinch recorded on macOS 15.6 / Electron 44 (≈ ×2.34).
const recorded = [-2.239, -3.707, -5.912, -7.036, -7.794, -7.826, -7.729, -7.024, -6.384, -5.953, -5.576, -4.863, -4.385, -3.650, -2.904, -1.889, -0.200];
// A photo pet near the 8 MB asset limit: saving it takes long enough that a quick tap
// lands while a pinch is still being saved, as it can on a real Mac.
function noisePng(size) {
  const row = 1 + size * 4, pixels = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) randomFillSync(pixels, y * row + 1, size * 4);
  const chunk = (type, body) => {
    const head = Buffer.alloc(4), tail = Buffer.alloc(4), typed = Buffer.concat([Buffer.from(type), body]);
    head.writeUInt32BE(body.length);
    tail.writeUInt32BE(crc32(typed));
    return Buffer.concat([head, typed, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 0 })), chunk('IEND', Buffer.alloc(0))]);
}
const photoPet = createPetModel({ source: 'upload', model3D: null, image2D: 'data:image/png;base64,' + noisePng(1400).toString('base64') });
let app;
try {
  await writeFile(files.pet, serializePetPackage(photoPet));
  await writeFile(files.hint, JSON.stringify({ shown: 0 }));
  app = await _electron.launch({ executablePath, args: [`--user-data-dir=${data}`], env });
  // Surface the main process's own warnings (for example a failed save) if a check times out.
  for (const stream of [app.process().stdout, app.process().stderr]) stream.on('data', chunk => String(chunk).split('\n').filter(line => line.includes('[cornerpet]')).forEach(line => console.log('[main]', line)));
  const page = await app.firstWindow();
  await page.locator('.pet-grab').waitFor();
  const pinch = deltas => page.evaluate(async list => {
    for (const deltaY of list) {
      window.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY, cancelable: true }));
      await new Promise(resolve => setTimeout(resolve, 16));
    }
  }, deltas);
  const says = text => page.waitForFunction(value => document.querySelector('.pet-bubble')?.textContent === value, text);
  // waitForFunction does not await a returned Promise, so bridge calls are polled from here.
  const until = async (probe, label) => {
    for (const end = Date.now() + 5000; !(await probe());) {
      if (Date.now() > end) throw new Error('Timed out waiting for ' + (typeof label === 'function' ? label() : label));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  let lastSaved;
  const saved = scale => until(async () => (lastSaved = await page.evaluate(() => window.cornerpet.getConfig().then(pet => pet.scale))) === scale, () => 'saved scale ' + scale + ', still ' + lastSaved);
  const petWidth = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes('panel=size')).getBounds().width);
  const petBounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes('panel=size')).getBounds());
  // Count native window changes, and let the test move the cursor the main process reads.
  await app.evaluate(({ BrowserWindow, screen }) => {
    const pet = BrowserWindow.getAllWindows()[0], setBounds = pet.setBounds.bind(pet), cursor = screen.getCursorScreenPoint.bind(screen);
    globalThis.nativeResizes = 0;
    pet.setBounds = (...args) => { globalThis.nativeResizes++; return setBounds(...args); };
    globalThis.cursorShift = 0;
    screen.getCursorScreenPoint = () => { const point = cursor(); return { x: point.x + globalThis.cursorShift, y: point.y }; };
  });
  const nativeResizes = () => app.evaluate(() => globalThis.nativeResizes);
  const area = await app.evaluate(({ BrowserWindow, screen }) => {
    const display = screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds()), top = Math.max(display.bounds.y, display.workArea.y);
    return { ...display.bounds, y: top, height: display.bounds.y + display.bounds.height - top };
  });
  // The noise photo is opaque somewhere along every edge, so its body is the whole picture.
  const body = imageFootprint(192, 192, { x: 0, y: 0, width: 192, height: 192 });
  const { max } = await page.evaluate(() => window.cornerpet.getScaleOptions());
  assert.ok(max >= 2.34, 'Run on a display with room for 234% (at least 656 × 749 pt of work area)');

  // A hint that arrives just after the drag ended (a quick flick) still fades after about 3 s.
  const hint = '想换个大小？在我身上双指捏一捏，或者右键我～';
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('pet:resize-hint'));
  await says(hint);
  await until(async () => (await page.locator('.pet-bubble').textContent()) !== hint, 'the hint to fade');

  // A recorded pinch grows the pet around a fixed point: the window grows once, the pet scales
  // inside it with CSS, and the window shrinks once when the fingers stop. Feet stay planted.
  await page.waitForTimeout(300);
  const before = await petBounds(), resizesBefore = await nativeResizes();
  await pinch(recorded);
  await says('234%');
  await saved(2.34);
  assert.equal(await nativeResizes() - resizesBefore, 2, 'the native window changes only when a pinch starts and ends');
  assert.deepEqual(await petBounds(), anchoredPetBounds(resizeAnchor(before, body, 1, area), body, 2.34));
  assert.equal(await petWidth(), Math.round(280 * 2.34));
  assert.equal(parsePetPackage(await readFile(files.pet, 'utf8')).scale, 2.34);
  assert.deepEqual(JSON.parse(await readFile(files.hint, 'utf8')), { shown: 0 });

  // Pinching back near 100% lands on exactly 100%.
  await pinch(Array(10).fill(8.5));
  await says('刚刚好');
  await saved(1);
  const back = await petBounds();
  assert.ok(Math.abs(back.x - before.x) <= 1 && Math.abs(back.y - before.y) <= 1 && back.width === before.width, `shrinking back returns to the same place: ${JSON.stringify(before)} → ${JSON.stringify(back)}`);

  // Coarse unfocused-style bursts are bounded: e^0.40 ≈ 1.49, no jump to a limit.
  await pinch([-4, -59.786, -287.393, -398.399]);
  await saved(1.49);

  // The limits stop the pet and it says so.
  await pinch(Array(60).fill(-12));
  await says('已经最大啦');
  await saved(max);
  await pinch(Array(80).fill(12));
  await says('已经最小啦');
  await saved(.5);

  // Ordinary two-finger scrolling leaves the size alone.
  await page.evaluate(() => window.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, cancelable: true })));
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.cornerpet.getConfig().then(pet => pet.scale)), .5);

  // A pinch closes an open custom-size panel and keeps its own preview: .5 × e^0.8 ≈ 1.11.
  await app.evaluate(({ Menu }) => {
    const build = Menu.buildFromTemplate;
    Menu.buildFromTemplate = function (template) { globalThis.lastPetMenu = build.call(this, template); return globalThis.lastPetMenu; };
  });
  await page.locator('.pet-grab').click({ button: 'right', force: true });
  const panelEvent = app.waitForEvent('window');
  await app.evaluate(() => {
    const menu = globalThis.lastPetMenu;
    menu.closePopup();
    menu.items.find(item => item.label === '调整大小').submenu.items.find(item => item.label === '自定义…').click();
  });
  const panel = await panelEvent;
  await panel.locator('.size-panel').waitFor();
  await Promise.all([panel.waitForEvent('close'), pinch(Array(10).fill(-8))]);
  await saved(1.11);
  assert.equal(await petWidth(), Math.round(280 * 1.11));

  // A tap within 400 ms of a pinch saves the pinch first and leaves no drag running:
  // a running drag would make the main process ignore the next pinch's live preview.
  const grab = await page.locator('.pet-grab').boundingBox();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await pinch(Array(5).fill(-8));
  await page.mouse.down();
  await page.mouse.up();
  await saved(1.66);
  await page.waitForTimeout(100);
  await pinch([-8, -8]);
  await page.waitForTimeout(120);
  assert.ok(await petWidth() > Math.round(280 * 1.66), 'the next pinch previews live after a tap');
  await saved(1.95);

  // Real drags show the hint on the first three, even though this pet has been resized many
  // times; the fourth drag is quiet.
  await until(async () => (await page.locator('.pet-bubble').textContent()) === '', 'a quiet bubble');
  for (let drag = 1; drag <= 4; drag++) {
    await page.mouse.down();
    await app.evaluate((_, shift) => { globalThis.cursorShift = shift; }, drag * 30);
    await page.waitForTimeout(150);
    const during = await page.locator('.pet-bubble').textContent();
    await page.mouse.up();
    if (drag <= 3) assert.equal(during, hint, 'drag ' + drag + ' explains resizing');
    else assert.notEqual(during, hint, 'the fourth drag is quiet');
    if (drag === 1) {
      // Clicking the pet while it explains resizing gets its usual answer instead of the hint.
      await page.mouse.down();
      await page.mouse.up();
      await until(async () => { const text = await page.locator('.pet-bubble').textContent(); return text !== hint && text !== ''; }, 'a click answer instead of the hint');
    }
    await until(async () => (await page.locator('.pet-bubble').textContent()) !== hint, 'the hint to fade after drag ' + drag);
  }

  // When the size cannot be saved, the pet returns to its saved size and says so.
  await chmod(data, 0o500);
  try {
    await pinch(Array(10).fill(-8));
    await says('大小暂时没能记住，再捏一下试试');
    assert.equal(await page.evaluate(() => window.cornerpet.getConfig().then(pet => pet.scale)), 1.95);
    await until(async () => (await page.evaluate(() => window.cornerpet.getView())).scale === 1.95, 'view back at 1.95');
  } finally { await chmod(data, 0o700); }
  console.log('pinch resize desktop checks passed');
} finally {
  await app?.close().catch(() => {});
  await chmod(data, 0o700).catch(() => {});
  await rm(data, { recursive: true, force: true });
}
