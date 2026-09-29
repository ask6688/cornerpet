// npm run build first. Quit the installed App; PLAYWRIGHT_MODULE may use the tool installation.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { default: electronPath } = await import('electron');
const app = await _electron.launch({executablePath:process.env.CORNERPET_APP || electronPath,args:process.env.CORNERPET_APP ? [`${process.cwd()}/output/playwright/p2-mochi.cornerpet`] : ['.', 'output/playwright/p2-mochi.cornerpet']});
const page = await app.firstWindow();
const results = [];
try {
  await page.locator('.image-pet-face').waitFor();
  await page.waitForTimeout(700);
  const flags = await app.evaluate(({BrowserWindow}) => {const w=BrowserWindow.getAllWindows()[0]; return {background:w.getBackgroundColor(),shadow:w.hasShadow(),top:w.isAlwaysOnTop(),resize:w.isResizable(),workspaces:w.isVisibleOnAllWorkspaces()};});
  assert.ok(['#000000', '#00000000'].includes(flags.background)); assert.equal(flags.shadow,false); assert.equal(flags.top,true); assert.equal(flags.resize,false); assert.equal(flags.workspaces,true);
  const transparent = await page.screenshot({omitBackground:true});
  const cornerAlpha = await app.evaluate(({nativeImage}, base64)=>nativeImage.createFromBuffer(Buffer.from(base64,'base64')).getBitmap()[3],transparent.toString('base64'));
  assert.equal(cornerAlpha,0);
  assert.equal(await page.locator('.quit, .pet-scale, input[type=range]').count(),0);
  await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setPosition(500,250));
  for (const scale of [.75,1,1.25]) {
    await page.evaluate(scale => window.cornerpet.setScale(scale),scale);
    await page.locator('.pet-grab').click({position:{x:130*scale,y:130*scale},force:true});
    await page.waitForTimeout(250);
    const actual = await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
    assert.equal(actual.width, Math.round(280*scale)); assert.equal(actual.height,Math.round(320*scale));
    const bubble = await page.locator('.pet-bubble').boundingBox();
    assert.ok(bubble.x >= 0 && bubble.y >= 0 && bubble.x+bubble.width <= actual.width+1 && bubble.y+bubble.height <=actual.height+1);
    await page.screenshot({path:`output/playwright/desktop-png-${scale}.png`,omitBackground:true});
    results.push({kind:'PNG',scale,bounds:actual,bubble});
  }
  // Inspect the actual native context menu built in response to the renderer request.
  await app.evaluate(({Menu})=>{const build=Menu.buildFromTemplate;Menu.buildFromTemplate=function(template){globalThis.lastPetMenu=build.call(this,template);return globalThis.lastPetMenu;};});
  await page.evaluate(()=>window.cornerpet.menu());
  const menu = await app.evaluate(()=>globalThis.lastPetMenu.items.map(item=>({label:item.label,children:item.submenu?.items.map(child=>child.label)})));
  assert.ok(menu.some(item=>item.label==='调整大小')); assert.ok(menu.some(item=>item.label==='暂时隐藏')); assert.ok(menu.some(item=>item.label==='退出桌宠'));
  await app.evaluate(()=>{const menu=globalThis.lastPetMenu;menu.closePopup();menu.items.find(item=>item.label==='暂时隐藏').click();});
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
  await app.evaluate(()=>globalThis.lastPetMenu.items.find(item=>item.label==='恢复显示').click());
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),true);
  // An actual OS cursor delta is separate from Chromium synthetic mouse coordinates.
  // Override it only in this integration test to exercise the real drag timer/window updates.
  await app.evaluate(({screen})=>{globalThis.realCursor=screen.getCursorScreenPoint;screen.getCursorScreenPoint=()=>({x:650,y:420});});
  await page.evaluate(()=>window.cornerpet.startDrag());
  await app.evaluate(({screen})=>{screen.getCursorScreenPoint=()=>({x:250,y:260});});
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.cornerpet.endDrag()),true);
  for (const cursor of [{x:-9999,y:-9999},{x:9999,y:9999}]) {
    await page.evaluate(()=>window.cornerpet.startDrag());
    await app.evaluate(({screen},cursor)=>{screen.getCursorScreenPoint=()=>cursor;},cursor);
    await page.waitForTimeout(100);
    await page.evaluate(()=>window.cornerpet.endDrag());
    await page.locator('.pet-grab').press('Enter');
    await page.waitForTimeout(250);
    const bubble=await page.locator('.pet-bubble').boundingBox();
    const bounds=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
    assert.ok(bubble.x>=-1 && bubble.y>=-1 && bubble.x+bubble.width<=bounds.width+1 && bubble.y+bubble.height<=bounds.height+1,'edge speech clipped');
    await page.screenshot({path:`output/playwright/desktop-edge-${cursor.x<0?'top':'bottom'}.png`,omitBackground:true});
  }
  await app.evaluate(({screen})=>{screen.getCursorScreenPoint=globalThis.realCursor;});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setPosition(500,250));
  const saved = JSON.parse(await readFile(`${await app.evaluate(({app})=>app.getPath('userData'))}/last-pet.cornerpet`,'utf8')).pet;
  assert.equal(saved.scale,1.25);
  await app.evaluate(({app}, file)=>app.emit('open-file',{preventDefault(){}},file),`${process.cwd()}/output/playwright/desktop-before.cornerpet`);
  await page.locator('.pet-3d canvas').waitFor();
  for (const scale of [.75,1.25]) {
    await page.evaluate(scale=>window.cornerpet.setScale(scale),scale);
    await page.locator('.pet-grab').click({force:true});
    await page.waitForTimeout(300);
    const stage=await page.locator('.pet-grab').boundingBox(), canvas=await page.locator('.pet-3d canvas').boundingBox();
    assert.ok(Math.abs(stage.width-canvas.width)<1 && Math.abs(stage.height-canvas.height)<1,'3D canvas scaled twice and clips');
    await page.screenshot({path:`output/playwright/desktop-3d-${scale}.png`,omitBackground:true});
    const bounds=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getBounds());
    assert.equal(bounds.width,Math.round(280*scale)); results.push({kind:'3D',scale,bounds});
  }
  await writeFile('output/playwright/desktop-experience-results.json',JSON.stringify({flags,menu,results,hideRecall:true,dragTimer:true,scalePersisted:true},null,2));
  console.log(JSON.stringify({flags,menu,hideRecall:true,dragTimer:true,scalePersisted:true,scales:results.map(r=>`${r.kind}:${r.scale}`)}));
} finally { await app.close(); }
