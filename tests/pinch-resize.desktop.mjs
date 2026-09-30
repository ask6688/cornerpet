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
  const assertBoundsNear = async expected => {
    const actual = await petBounds();
    assert.equal(actual.width, expected.width);
    assert.equal(actual.height, expected.height);
    assert.ok(Math.abs(actual.x - expected.x) <= 2 && Math.abs(actual.y - expected.y) <= 2, `native position ${JSON.stringify(actual)} differs from ${JSON.stringify(expected)}`);
  };
  // Count native window changes, and let the test move the cursor the main process reads.
  await app.evaluate(({ BrowserWindow, screen }) => {
    const pet = BrowserWindow.getAllWindows()[0], setBounds = pet.setBounds.bind(pet), cursor = screen.getCursorScreenPoint.bind(screen);
    globalThis.nativeResizes = 0;
    globalThis.boundsLog = [];
    // Log where macOS actually put the window: near the menu bar it keeps it lower than asked.
    pet.setBounds = (...args) => { globalThis.nativeResizes++; const result = setBounds(...args); globalThis.boundsLog.push({ t: Date.now(), ...pet.getBounds() }); return result; };
    globalThis.cursorShift = 0;
    globalThis.cursorShiftY = 0;
    globalThis.cursorReads = 0;
    globalThis.rawCursor = cursor;
    screen.getCursorScreenPoint = () => { globalThis.cursorReads++; const point = globalThis.cursorBase ?? cursor(); return { x: point.x + globalThis.cursorShift, y: point.y + globalThis.cursorShiftY }; };
    // Slow every save down, so a drag or a second pinch can reliably land while one is running.
    const files = process.getBuiltinModule('fs/promises'), rename = files.rename;
    globalThis.slowSaves = on => {
      files.rename = on ? async (...args) => { await new Promise(resolve => setTimeout(resolve, 700)); return rename(...args); } : rename;
      process.getBuiltinModule('module').syncBuiltinESMExports();
    };
  });
  const nativeResizes = () => app.evaluate(() => globalThis.nativeResizes);
  // The pet sleeps (and keeps quiet) once the Mac has been idle for 10 minutes; keep it awake.
  await app.evaluate(({ powerMonitor }) => { powerMonitor.getSystemIdleTime = () => 0; });
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

  await app.evaluate(({ Menu }) => {
    const build = Menu.buildFromTemplate;
    Menu.buildFromTemplate = function (template) { globalThis.lastPetMenu = build.call(this, template); return globalThis.lastPetMenu; };
  });
  const openSizePanel = async () => {
    await page.locator('.pet-grab').click({ button: 'right', force: true });
    const opened = app.waitForEvent('window');
    await app.evaluate(() => {
      const menu = globalThis.lastPetMenu;
      menu.closePopup();
      menu.items.find(item => item.label === '调整大小').submenu.items.find(item => item.label === '自定义…').click();
    });
    const panel = await opened;
    await panel.locator('.size-panel').waitFor();
    await panel.waitForFunction(() => !document.querySelector('input[type=range]').disabled);
    return panel;
  };
  // Log every rendered frame; the returned check proves each one kept the pet's fixed point in place.
  const watchFrames = async () => {
    await app.evaluate(() => { globalThis.boundsLog = []; });
    await page.evaluate(() => {
      const pet = document.querySelector('.desktop-pet');
      window.frameLog = [];
      const tick = () => { window.frameLog.push({ t: Date.now(), w: innerWidth, tf: pet.style.transform }); if (window.frameLog.length < 900) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    return async (rest, fixed) => {
      const placed = [{ t: 0, ...rest }, ...await app.evaluate(() => globalThis.boundsLog)];
      const frames = await page.evaluate(() => window.frameLog);
      for (const [index, frame] of frames.entries()) {
        const bounds = placed.filter(entry => entry.t <= frame.t && Math.abs(entry.width - frame.w) <= 1).at(-1);
        const [, x, y, scale] = frame.tf.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/).map(Number);
        const pointX = bounds.x + x + (body.x + fixed.ax * body.width) * scale, pointY = bounds.y + y + (body.y + body.height) * scale;
        assert.ok(Math.abs(pointX - fixed.x) <= 2 && Math.abs(pointY - fixed.y) <= 2, `a frame drew the fixed point at (${pointX.toFixed(1)}, ${pointY.toFixed(1)}) instead of (${fixed.x.toFixed(1)}, ${fixed.y.toFixed(1)}): ${JSON.stringify({ frame, bounds, nearbyFrames: frames.slice(Math.max(0, index - 2), index + 3), recentBounds: placed.filter(entry => entry.t <= frame.t).slice(-4) })}`);
      }
    };
  };

  // A pinch closes an open custom-size panel and keeps its own preview: .5 × e^0.8 ≈ 1.11.
  const panel = await openSizePanel();
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

  // Pinch, stop, pinch again. On every frame, including the first ones after the window grows
  // (whose new position the page learns a frame late), the pet's fixed point stays put on screen.
  await page.waitForTimeout(700);
  const rest = await petBounds(), fixed = resizeAnchor(rest, body, 1.95, area);
  const pinchFrames = await watchFrames();
  await pinch(Array(4).fill(8));
  await saved(1.42);
  await page.waitForTimeout(700);
  await pinch(Array(4).fill(8));
  await saved(1);
  await page.waitForTimeout(700);
  await pinchFrames(rest, fixed);

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

  // The custom-size panel previews like a pinch: the window grows once, the slider only rescales
  // the pet around the same fixed point, and saving shrinks it once. Panel values do not snap.
  await page.waitForTimeout(700);
  const panelRest = await petBounds(), panelFixed = resizeAnchor(panelRest, body, 1, area), resizesBefore2 = await nativeResizes();
  const panelFrames = await watchFrames();
  let sizePanel = await openSizePanel();
  for (const value of ['120', '150', '180', '103']) { await sizePanel.getByRole('slider').fill(value); await page.waitForTimeout(80); }
  assert.equal(await nativeResizes() - resizesBefore2, 1, 'previewing in the panel grows the window once');
  await Promise.all([sizePanel.waitForEvent('close'), sizePanel.getByRole('button', { name: '就这么大' }).click()]);
  await saved(1.03);
  assert.equal(await nativeResizes() - resizesBefore2, 2, 'saving from the panel shrinks the window once');
  await assertBoundsNear(anchoredPetBounds(panelFixed, body, 1.03));
  await page.waitForTimeout(300);
  await panelFrames(panelRest, panelFixed);
  // Leaving the panel without saving puts the pet back exactly where and how big it was.
  sizePanel = await openSizePanel();
  await sizePanel.getByRole('slider').fill('160');
  await page.waitForTimeout(200);
  await Promise.all([sizePanel.waitForEvent('close'), sizePanel.getByRole('button', { name: '先这样' }).click()]);
  await until(async () => (await petBounds()).width === Math.round(280 * 1.03), 'the window back at the saved size');
  await assertBoundsNear(anchoredPetBounds(panelFixed, body, 1.03));
  assert.equal(await page.evaluate(() => window.cornerpet.getConfig().then(pet => pet.scale)), 1.03);

  const moveGrab = async () => { const grab = await page.locator('.pet-grab').boundingBox(); await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2); };
  const dragBy = async (dx, dy) => {
    await moveGrab();
    await page.mouse.down();
    await app.evaluate((_, [x, y]) => { globalThis.cursorShift += x; globalThis.cursorShiftY += y; }, [dx, dy]);
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  const choosePreset = label => app.evaluate((_, name) => globalThis.lastPetMenu.items.find(item => item.label === '调整大小').submenu.items.find(item => item.label === name).click(), label);

  // A preset chosen while the panel previews ends that preview properly: once the panel closes,
  // the pet is drawn inside its window at the preset size and can be dragged again.
  sizePanel = await openSizePanel();
  await sizePanel.getByRole('slider').fill('180');
  await page.waitForTimeout(250);
  await choosePreset('刚刚好');
  await saved(1);
  await Promise.all([sizePanel.waitForEvent('close'), sizePanel.getByRole('button', { name: '先这样' }).click()]);
  await until(async () => (await petBounds()).width === 280, 'the window at the preset size');
  await until(async () => await page.evaluate(() => document.querySelector('.desktop-pet').style.transform) === 'translate(0px, 0px) scale(1)', 'the pet drawn inside its window');
  const beforeDrag = await petBounds();
  // Leftwards: the pet stands against the right edge, where the screen stops it.
  await dragBy(-40, 0);
  assert.equal((await petBounds()).x, beforeDrag.x - 40, 'the pet can be dragged again');

  // A drag that starts while a pinch is being saved waits for the save, then moves the pet by
  // the cursor's travel, instead of jumping to where the grown window was.
  const beforeSlowPinch = await petBounds();
  await app.evaluate(() => globalThis.slowSaves(true));
  await pinch(Array(4).fill(-8));
  await page.waitForTimeout(480);
  await moveGrab();
  // Playwright can move the OS pointer as the native window settles; hold its real position
  // still while the synthetic cursor shift models a user's stationary hand and 40 pt drag.
  await app.evaluate(() => { globalThis.cursorBase = globalThis.rawCursor(); });
  const readsBeforeDrag = await app.evaluate(() => globalThis.cursorReads);
  await page.mouse.down();
  await saved(1.38);
  await until(async () => (await app.evaluate(() => globalThis.cursorReads)) > readsBeforeDrag, 'the drag to start after the size save');
  await app.evaluate(() => { globalThis.cursorShift -= 40; });
  const settledThere = anchoredPetBounds(resizeAnchor(beforeSlowPinch, body, 1, area), body, 1.38);
  let whileDragging;
  await until(async () => {
    whileDragging = await petBounds();
    return Math.abs(whileDragging.x - settledThere.x + 40) <= 2 && Math.abs(whileDragging.y - settledThere.y) <= 2;
  }, () => 'the drag to move 40 pt left, still ' + JSON.stringify(whileDragging));
  await page.mouse.up();
  await app.evaluate(() => { globalThis.cursorBase = undefined; });
  await app.evaluate(() => globalThis.slowSaves(false));
  const afterDrag = await petBounds();
  assert.ok(Math.abs(afterDrag.x - settledThere.x + 40) <= 2 && Math.abs(afterDrag.y - settledThere.y) <= 2, `the drag moved the pet from ${JSON.stringify(settledThere)} to ${JSON.stringify(afterDrag)}`);

  // Pinching on straight through a save: the second pinch continues from the first one's size,
  // so while the fingers only spread the pet is never drawn smaller.
  await page.waitForTimeout(300);
  const growFrames = await watchFrames();
  await app.evaluate(() => globalThis.slowSaves(true));
  await pinch(Array(3).fill(-6));
  await page.waitForTimeout(380);
  await pinch(Array(90).fill(-1));
  await app.evaluate(() => globalThis.slowSaves(false));
  await page.waitForTimeout(1800);
  let drawnBefore = 0;
  for (const frame of await page.evaluate(() => window.frameLog)) {
    const drawn = Number(frame.tf.match(/scale\(([-\d.e]+)\)/)[1]);
    assert.ok(drawn >= drawnBefore - .005, `a spreading pinch drew the pet smaller: ${drawnBefore} → ${drawn}`);
    drawnBefore = drawn;
  }
  void growFrames;

  // Near the menu bar macOS keeps the window lower than asked. The end of a pinch there still
  // draws the pet in place on every frame.
  await choosePreset('刚刚好');
  await saved(1);
  await page.waitForTimeout(300);
  await dragBy(0, -3000);
  await dragBy(0, 20);
  const nearTop = await petBounds(), nearTopView = await page.evaluate(() => window.cornerpet.getView());
  assert.ok(nearTopView.offset.y < 0, 'the pet sits with its head under the menu bar');
  const topFixed = resizeAnchor({ ...nearTop, x: nearTop.x + nearTopView.offset.x, y: nearTop.y + nearTopView.offset.y }, body, 1, area);
  const topFrames = await watchFrames();
  await pinch([-3, -3]);
  await saved(1.06);
  await page.waitForTimeout(500);
  await topFrames(nearTop, topFixed);

  // When the size cannot be saved, the pet returns to its saved size and says so.
  await chmod(data, 0o500);
  try {
    await pinch(Array(10).fill(-8));
    await says('大小暂时没能记住，再捏一下试试');
    assert.equal(await page.evaluate(() => window.cornerpet.getConfig().then(pet => pet.scale)), 1.06);
    await until(async () => (await page.evaluate(() => window.cornerpet.getView())).scale === 1.06, 'view back at 1.06');
  } finally { await chmod(data, 0o700); }
  console.log('pinch resize desktop checks passed');
} finally {
  await app?.close().catch(() => {});
  await chmod(data, 0o700).catch(() => {});
  await rm(data, { recursive: true, force: true });
}
