import { app, BrowserWindow, ipcMain, Menu, Tray, screen, session, dialog, nativeImage, powerMonitor } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PET, parseLaunchUrl } from '../shared/pet-config.mjs';
import { DESKTOP_SIZE, DEFAULT_FOOTPRINT, validFootprint, containPet, desktopDragPosition, resizedPetBounds, visibleViewport, desktopScaleLimits, resizeAnchor, anchoredPetBounds, pinchRoom } from './layout.mjs';
import { createHandoffServer, parseDesktopPackage } from './handoff.mjs';
import { createPetStorage, readPetFile } from './pet-storage.mjs';
import { DEFAULT_HINT_STATE, createResizeHintStore, nextResizeHint } from './resize-hint.mjs';

import { createPetStateMachine } from '../shared/pet-state.mjs';

const behavior = createPetStateMachine({ now: performance.now() });
let behaviorTimer;
let screenLocked = false, suspended = false;

function sampleBehavior(click = false) {
  const previous = behavior.getSnapshot();
  try {
    const next = behavior.step({ now: performance.now(), idleSeconds: powerMonitor.getSystemIdleTime(), blocked: screenLocked || suspended, click });
    if (next !== previous && petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet:state', next);
    return next;
  } catch { return previous; }
}

const directory = path.dirname(fileURLToPath(import.meta.url));
const page = pathToFileURL(path.join(directory, '../dist/desktop/index.html')).href;
let petWindow;
let sizeWindow;
let renderScale = 1;
let previewScale;
// A pinch in progress: the fixed point it grows around and the sizes it may reach.
let pinch;
let tray;
let footprint = DEFAULT_FOOTPRINT;
let contentOffset = { x: 0, y: 0 };
let drag;
let dragTimer;
let launchPet = PET;
let pendingFile;
let importRequest = 0;
const handoff = createHandoffServer({ adopt: adoptDesktopPackage });
const petStorage = createPetStorage(app.getPath('userData'));
const hintStore = createResizeHintStore(app.getPath('userData'));
let hintState = DEFAULT_HINT_STATE;

function readDesktopPackage(text) {
  return parseDesktopPackage(text, bytes => {
    const image = nativeImage.createFromBuffer(bytes);
    return image.isEmpty() ? null : image.getSize();
  });
}

async function adoptDesktopPackage(text) {
  const incoming = readDesktopPackage(text);
  // Recalling the same companion must not overwrite this desktop's chosen size.
  const config = incoming.petId === launchPet.petId ? Object.freeze({ ...incoming, scale: launchPet.scale }) : incoming;
  const request = ++importRequest;
  pendingFile = undefined;
  await petStorage.save(config);
  if (request !== importRequest) throw new Error('桌宠已被新的选择替换');
  launchPet = config;
  await showPet(true);
  if (request !== importRequest) throw new Error('桌宠已被新的选择替换');
  return config;
}

// Register before ready: macOS delivers cold-start URLs during startup.
app.on('open-url', (event, url) => {
  event.preventDefault();
  acceptUrl(url);
});

function acceptUrl(url) {
  try {
    if (new URL(url).hostname === 'connect') {
      handoff.pair(url);
      return;
    }
    launchPet = parseLaunchUrl(url);
    ++importRequest;
    pendingFile = undefined;
    console.info('[cornerpet] accepted deep link', launchPet.id);
    if (app.isReady()) {
      void petStorage.save(launchPet).catch(() => console.warn('[cornerpet] could not save pet'));
      showPet(true);
    }
  } catch { console.warn('[cornerpet] rejected invalid deep link'); }
}

app.on('open-file', (event, file) => {
  event.preventDefault();
  acceptFile(file);
});

function acceptFile(file) {
  pendingFile = file;
  if (app.isReady()) void importPetFile(file);
}

function acceptArguments(argv, workingDirectory) {
  const argument = argv.slice(1).findLast(value => !value.startsWith('-') &&
    (value.startsWith('cornerpet:') || path.extname(value).toLowerCase() === '.cornerpet'));
  if (!argument) return false;
  if (argument.startsWith('cornerpet:')) acceptUrl(argument);
  else acceptFile(path.resolve(workingDirectory, argument));
  return true;
}

async function importPetFile(file) {
  const request = ++importRequest;
  try {
    if (path.extname(file).toLowerCase() !== '.cornerpet') throw new Error('请选择 .cornerpet 桌宠文件');
    const incoming = readDesktopPackage(await readPetFile(file));
    const config = incoming.petId === launchPet.petId ? Object.freeze({ ...incoming, scale: launchPet.scale }) : incoming;
    if (request !== importRequest) return;
    await petStorage.save(config);
    if (request !== importRequest) return;
    launchPet = config;
    console.info('[cornerpet] imported pet package', launchPet.type);
    await showPet(true);
  } catch (error) {
    if (request !== importRequest) return;
    dialog.showErrorBox('这只桌宠暂时打不开', error.message);
    showPet();
  }
}

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
else {
  // Finder routes open-file to this instance; direct CLI launches use argv.
  acceptArguments(process.argv, process.cwd());
  app.on('second-instance', (_event, argv, workingDirectory) => {
    if (!acceptArguments(argv, workingDirectory) && app.isReady()) showPet();
  });
  app.on('activate', () => { if (app.isReady()) showPet(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { clearInterval(dragTimer); clearInterval(behaviorTimer); sizeWindow?.destroy(); tray?.destroy(); tray = undefined; void handoff.close(); });
  app.whenReady().then(async () => {
    if (process.platform !== 'darwin') throw new Error('Phase 1 仅支持 macOS');
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    if (app.isPackaged) app.setAsDefaultProtocolClient('cornerpet');
    app.dock?.hide();
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: '桌角生物', submenu: [{ label: '退出桌角生物', accelerator: 'Command+Q', click: () => app.quit() }] }]));
    tray = new Tray(nativeImage.createEmpty());
    tray.setTitle('◡');
    tray.setToolTip('桌角生物 · 召回小伙伴 / 调整大小');
    updateTray();
    screenLocked = powerMonitor.getSystemIdleState(120) === 'locked';
    powerMonitor.on('lock-screen', () => { screenLocked = true; sampleBehavior(); });
    powerMonitor.on('unlock-screen', () => { screenLocked = false; sampleBehavior(true); });
    powerMonitor.on('suspend', () => { suspended = true; sampleBehavior(); });
    powerMonitor.on('resume', () => { suspended = false; sampleBehavior(); });
    sampleBehavior();
    behaviorTimer = setInterval(sampleBehavior, 1000);
    screen.on('display-removed', keepOnDisplay);
    screen.on('display-metrics-changed', keepOnDisplay);
    hintState = await hintStore.read();
    if (!pendingFile && importRequest === 0) {
      try {
        const saved = readDesktopPackage(await petStorage.read());
        // A cold-start file/URL event always takes precedence over the saved companion.
        if (!pendingFile && importRequest === 0) launchPet = saved;
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('[cornerpet] could not restore saved pet');
      }
    }
    // The file/protocol fallbacks remain available if the local port is occupied.
    void handoff.listen().catch(() => console.warn('[cornerpet] local handoff unavailable'));
    if (pendingFile) void importPetFile(pendingFile);
    else {
      if (importRequest > 0) void petStorage.save(launchPet).catch(() => console.warn('[cornerpet] could not save pet'));
      showPet();
    }
  }).catch(error => { dialog.showErrorBox('桌角生物未能启动', error.message); app.quit(); });
}

function showPet(refresh = false) {
  if (refresh) sizeWindow?.close();
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setTitle(`${launchPet.name} · 桌角生物`);
    if (refresh) {
      finishDrag();
      pinch = undefined;
      footprint = DEFAULT_FOOTPRINT;
      resizeWindow();
      const loaded = petWindow.loadURL(page);
      loaded.catch(error => console.warn('[cornerpet] could not refresh pet', error.message));
      petWindow.showInactive();
      updateTray();
      return loaded;
    }
    petWindow.showInactive();
    updateTray();
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  contentOffset = { x: 0, y: 0 };
  renderScale = Math.min(launchPet.scale, desktopScaleLimits(area).max);
  const size = { width: Math.round(DESKTOP_SIZE.width * renderScale), height: Math.round(DESKTOP_SIZE.height * renderScale) };
  petWindow = new BrowserWindow({
    ...size,
    x: area.x + Math.max(0, area.width - size.width - 28),
    y: area.y + Math.max(0, area.height - size.height - 10),
    title: `${launchPet.name} · 桌角生物`,
    transparent: true, frame: false, backgroundColor: '#00000000',
    alwaysOnTop: true, hasShadow: false, resizable: false,
    maximizable: false, minimizable: false, fullscreenable: false,
    skipTaskbar: true, show: false,
    webPreferences: {
      preload: path.join(directory, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
    },
  });
  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.setWindowButtonVisibility(false);
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('will-navigate', event => event.preventDefault());
  petWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  petWindow.once('ready-to-show', () => petWindow.showInactive());
  petWindow.on('move', sendView);
  petWindow.on('show', updateTray);
  petWindow.on('hide', updateTray);
  petWindow.on('blur', finishDrag);
  petWindow.on('closed', () => { finishDrag(); sizeWindow?.close(); petWindow = undefined; });
  const loaded = petWindow.loadURL(page);
  loaded.catch(error => {
    // A cold-start file event can replace the initial page while it is loading.
    if (error.code === 'ERR_ABORTED') return;
    dialog.showErrorBox('角色加载失败', error.message);
    app.quit();
  });
  return loaded;
}

function trusted(event, window = petWindow) {
  return window && !window.isDestroyed() && event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === window.webContents.getURL();
}

function updateDrag() {
  if (!drag || !petWindow || petWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const nextScale = Math.min(previewScale ?? launchPet.scale, desktopScaleLimits(display.workArea).max);
  if (nextScale !== renderScale) {
    renderScale = nextScale;
    petWindow.setSize(Math.round(DESKTOP_SIZE.width * renderScale), Math.round(DESKTOP_SIZE.height * renderScale));
  }
  const next = desktopDragPosition(drag, cursor, displayArea(display), footprint, renderScale);
  if (next.moved && !drag.moved) offerResizeHint();
  drag.moved ||= next.moved;
  if (drag.moved) placeWindow({ ...petWindow.getBounds(), x: next.x, y: next.y });
}

function displayArea(display) {
  // macOS reserves the menu bar; Dock-side padding need not confine the character.
  const top = Math.max(display.bounds.y, display.workArea.y);
  return { ...display.bounds, y: top, height: display.bounds.y + display.bounds.height - top };
}

function visualBounds() {
  const bounds = petWindow.getBounds();
  return { ...bounds, x: bounds.x + contentOffset.x, y: bounds.y + contentOffset.y };
}

function placeWindow(bounds) {
  petWindow.setBounds(bounds);
  const actual = petWindow.getBounds();
  // macOS may clamp the native frame at the menu bar. Shift only its transparent
  // padding inside the frame so the character itself can still reach that edge.
  contentOffset = { x: bounds.x - actual.x, y: bounds.y - actual.y };
  sendView();
}

function currentView() {
  const bounds = visualBounds(), actual = petWindow.getBounds();
  const area = displayArea(screen.getDisplayMatching(bounds));
  const left = Math.max(area.x, actual.x), top = Math.max(area.y, actual.y);
  const visible = { x: left, y: top, width: Math.max(0, Math.min(area.x + area.width, actual.x + actual.width) - left), height: Math.max(0, Math.min(area.y + area.height, actual.y + actual.height) - top) };
  return { scale: renderScale, offset: contentOffset, viewport: visibleViewport(bounds, renderScale, visible) };
}

function sendView() {
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet:view', currentView());
}

function resizeWindow(previousScale = petWindow.getBounds().width / DESKTOP_SIZE.width) {
  const bounds = visualBounds();
  const display = screen.getDisplayMatching(bounds);
  renderScale = Math.min(previewScale ?? launchPet.scale, desktopScaleLimits(display.workArea).max);
  placeWindow(resizedPetBounds(bounds, previousScale, renderScale, footprint, displayArea(display)));
}

// After a pinch the window shrinks once, back around the same fixed point.
function settleWindow() {
  if (!pinch) return resizeWindow(renderScale);
  const { anchor } = pinch;
  pinch = undefined;
  renderScale = Math.min(launchPet.scale, desktopScaleLimits(screen.getDisplayMatching(visualBounds()).workArea).max);
  placeWindow(anchoredPetBounds(anchor, footprint, renderScale));
}

function keepOnDisplay() {
  if (!petWindow || petWindow.isDestroyed() || pinch) return;
  finishDrag();
  const bounds = visualBounds();
  const display = screen.getDisplayMatching(bounds);
  if (Math.min(previewScale ?? launchPet.scale, desktopScaleLimits(display.workArea).max) !== renderScale) {
    resizeWindow(renderScale);
    return;
  }
  const next = containPet(bounds, displayArea(display), footprint, renderScale);
  placeWindow({ ...bounds, ...next });
}

async function setPetScale(scale) {
  const { min, max } = scaleOptions();
  if (!Number.isFinite(scale) || scale < min || scale > max) throw new Error(`大小请在 ${Math.round(min * 100)}%–${Math.round(max * 100)}% 之间`);
  finishDrag();
  const previous = launchPet;
  const request = importRequest;
  const next = Object.freeze({ ...previous, scale });
  try { await petStorage.save(next); }
  catch (error) { throw new Error('大小暂时没能保存，请再试一次', { cause: error }); }
  if (request !== importRequest) throw new Error('小伙伴已经换了一只，请重新调整');
  launchPet = next;
  previewScale = undefined;
  settleWindow();
  updateTray();
  return scale;
}

function scaleOptions() {
  const display = petWindow && !petWindow.isDestroyed() ? screen.getDisplayMatching(visualBounds()) : screen.getPrimaryDisplay();
  return { scale: renderScale, ...desktopScaleLimits(display.workArea) };
}

function showSizeWindow() {
  finishDrag();
  if (sizeWindow && !sizeWindow.isDestroyed()) { sizeWindow.show(); return; }
  sizeWindow = new BrowserWindow({
    width: 360, height: 310, title: '小伙伴的大小', backgroundColor: '#FFF9EF',
    resizable: false, minimizable: false, maximizable: false,
    fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, show: false,
    webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  sizeWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  sizeWindow.webContents.on('will-navigate', event => event.preventDefault());
  sizeWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  sizeWindow.once('ready-to-show', () => sizeWindow?.show());
  sizeWindow.on('closed', () => {
    sizeWindow = undefined;
    // A pinch that closed this panel owns the window now.
    if (pinch) return;
    previewScale = undefined;
    if (petWindow && !petWindow.isDestroyed()) resizeWindow(renderScale);
  });
  const url = new URL(page);
  url.searchParams.set('panel', 'size');
  void sizeWindow.loadURL(url.href).catch(error => {
    sizeWindow?.close();
    dialog.showErrorBox('大小面板暂时打不开', error.message);
  });
}

function companionMenu() {
  return Menu.buildFromTemplate([
    { label: `${launchPet.name} · 桌角的小伙伴`, enabled: false },
    { type: 'separator' },
    { label: '调整大小', submenu: [...[[.75, '小小一只'], [1, '刚刚好'], [1.25, '大一点']].map(([scale, label]) => ({
      label, type: 'radio', checked: Math.abs(renderScale - scale) < .01, enabled: scale <= scaleOptions().max,
      click: () => void setPetScale(scale).catch(error => dialog.showErrorBox('暂时没能记住大小', error.message)),
    })), { type: 'separator' }, { label: '自定义…', click: showSizeWindow }] },
    { label: petWindow?.isVisible() ? '暂时隐藏' : '恢复显示', click: () => {
      finishDrag(); if (petWindow?.isVisible()) petWindow.hide(); else showPet();
      updateTray();
    } },
    { type: 'separator' },
    { label: '退出桌宠', accelerator: 'Command+Q', click: () => app.quit() },
  ]);
}

function updateTray() { tray?.setContextMenu(companionMenu()); }

function saveHintState(state) {
  hintState = state;
  void hintStore.save(state).catch(() => console.warn('[cornerpet] could not save resize hint'));
}

// Dragging is when people handle the pet, so that is when it mentions resizing.
function offerResizeHint() {
  const { show, state } = nextResizeHint(hintState, { sleeping: behavior.getSnapshot().state === 'sleep', pinching: pinch !== undefined });
  if (!show) return;
  saveHintState(state);
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send('pet:resize-hint');
}

function finishDrag() {
  updateDrag();
  clearInterval(dragTimer);
  const moved = drag?.moved ?? false;
  drag = undefined;
  return moved;
}

ipcMain.handle('pet:drag-start', event => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  finishDrag();
  const { x, y } = visualBounds();
  drag = { x, y, cursor: screen.getCursorScreenPoint(), moved: false };
  dragTimer = setInterval(updateDrag, 16);
});
ipcMain.handle('pet:config', event => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  return launchPet;
});
ipcMain.handle('pet:scale', (event, scale) => {
  if (!trusted(event) && !trusted(event, sizeWindow)) throw new Error('Untrusted sender');
  return setPetScale(scale);
});
ipcMain.handle('pet:scale-options', event => {
  if (!trusted(event) && !trusted(event, sizeWindow)) throw new Error('Untrusted sender');
  return scaleOptions();
});
// A pinch grows the window once to the largest size it may reach. The page then scales the pet
// with CSS around the fixed point, so the native window changes only at the start and the end.
ipcMain.handle('pet:resize-begin', event => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  if (drag) return null;
  if (!pinch) {
    if (sizeWindow && !sizeWindow.isDestroyed()) {
      previewScale = undefined;
      sizeWindow.close();
    }
    const bounds = visualBounds(), display = screen.getDisplayMatching(bounds), area = displayArea(display);
    const { min, max } = desktopScaleLimits(display.workArea);
    const anchor = resizeAnchor(bounds, footprint, renderScale, area);
    pinch = { anchor, limits: { min, max: Math.min(max, Math.max(renderScale, pinchRoom(anchor, footprint, area))) } };
    placeWindow(anchoredPetBounds(anchor, footprint, pinch.limits.max));
  }
  return { anchor: pinch.anchor, footprint, limits: pinch.limits };
});
ipcMain.handle('pet:resize-commit', (event, scale) => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  if (!Number.isFinite(scale)) throw new Error('Invalid pet scale');
  const { min, max } = pinch?.limits ?? scaleOptions();
  return setPetScale(Math.round(Math.min(max, Math.max(min, scale)) * 100) / 100);
});
ipcMain.handle('pet:resize-cancel', event => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  if (!pinch) return renderScale;
  const { anchor } = pinch;
  pinch = undefined;
  placeWindow(anchoredPetBounds(anchor, footprint, renderScale));
  return renderScale;
});
// An unfocused window receives only a few coarse pinch events; taking focus
// on the first one is the same as the click that starts every drag.
ipcMain.on('pet:focus', event => {
  if (trusted(event) && !petWindow.isFocused()) petWindow.focus();
});
ipcMain.handle('pet:scale-preview', (event, scale) => {
  if (!sizeWindow || !trusted(event, sizeWindow)) throw new Error('Untrusted sender');
  const { min, max } = scaleOptions();
  if (!Number.isFinite(scale) || scale < min || scale > max) throw new Error(`大小请在 ${Math.round(min * 100)}%–${Math.round(max * 100)}% 之间`);
  finishDrag();
  previewScale = scale;
  resizeWindow(renderScale);
  return renderScale;
});
ipcMain.on('pet:scale-close', event => { if (sizeWindow && trusted(event, sizeWindow)) sizeWindow.close(); });
ipcMain.handle('pet:view', event => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  return currentView();
});
ipcMain.handle('pet:footprint', (event, value) => {
  if (!trusted(event) || !validFootprint(value)) throw new Error('Invalid pet footprint');
  footprint = { x: value.x, y: value.y, width: value.width, height: value.height };
  keepOnDisplay();
});
ipcMain.handle('pet:drag-end', event => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  return finishDrag();
});
ipcMain.on('pet:quit', event => { if (trusted(event)) app.quit(); });
ipcMain.on('pet:menu', event => {
  if (!trusted(event)) return;
  finishDrag();
  companionMenu().popup({ window: petWindow });
});

ipcMain.handle('pet:state', event => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  return sampleBehavior();
});
ipcMain.handle('pet:interact', event => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  return sampleBehavior(true);
});
