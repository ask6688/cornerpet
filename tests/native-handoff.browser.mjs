// Run with the Playwright tool module path in PLAYWRIGHT_MODULE if it is not installed locally.
// Start the installed CornerPet with --remote-debugging-port=9422 and serve production on :4173.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const root = process.cwd();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let routed = 0;
const desktop = await chromium.connectOverCDP('http://127.0.0.1:9422');
const native = desktop.contexts()[0].pages()[0];
const results = [];
for (const [asset, label] of [
  ['experience-saved-3d.cornerpet', '3d'],
  ['experience-photo-original.cornerpet', 'photo-original'],
  ['experience-photo-generated.cornerpet', 'photo-generated'],
]) {
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
const cdp = await context.newCDPSession(page);
await cdp.send('Page.enable');
// The harness stands in for the browser's external-app confirmation only;
// macOS still dispatches the actual cornerpet:// URL to the installed bundle.
cdp.on('Page.frameRequestedNavigation', event => {
  if (event.url.startsWith('cornerpet://')) { routed++; void exec('open', [event.url]); }
});
  const text = await readFile(`${root}/output/playwright/${asset}`, 'utf8');
  await page.goto('http://127.0.0.1:4173/');
  await page.evaluate(async data => {
    await new Promise((resolve,reject) => { const open=indexedDB.open('cornerpet-companion',1); open.onupgradeneeded=()=>open.result.createObjectStore('pets'); open.onsuccess=()=>{const db=open.result; const tx=db.transaction('pets','readwrite'); tx.objectStore('pets').put(data,'companion'); tx.oncomplete=()=>{db.close();resolve()}; tx.onerror=()=>reject(tx.error)}; open.onerror=()=>reject(open.error) });
  }, text);
  await page.reload();
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).click();
  
  const name = await page.getByRole('textbox',{name:'给它一个小名'}).inputValue();
  await page.getByRole('button',{name:'带它去桌面',exact:true}).click();
  await page.getByText(`CornerPet 已接住${name}，去桌角点它一下吧`,{exact:true}).waitFor({timeout:12000});
  console.log('received',label,name);
  const actual = await native.evaluate(async()=>window.cornerpet.getConfig());
  // Package shape is validated below through the shared parser as well.
  const { parsePetPackage } = await import(`${root}/shared/pet-config.mjs`);
  const pet = parsePetPackage(text);
  assert.equal(actual.petId, pet.petId); assert.equal(actual.name, pet.name);
  assert.deepEqual(actual.model3D,pet.model3D); assert.equal(actual.image2D,pet.image2D);
  await native.locator('.pet-grab').waitFor();
  if (pet.type === 'procedural-3d') await native.locator('canvas').waitFor();
  else await native.locator('img').evaluate(img => img.decode());
  await native.waitForTimeout(1200);
  await native.screenshot({ path:`${root}/output/playwright/experience-native-${label}.png`,omitBackground:true });
  await page.screenshot({path:`${root}/output/playwright/experience-handoff-${label}.png`,fullPage:true});
  let last;
  for(let i=0;i<4;i++) {
    await native.locator('.pet-grab').press('Enter');
    const bubble = await native.locator('.pet-bubble').innerText();
    assert.ok(bubble && bubble!==last); last=bubble;
  }
  await native.waitForTimeout(1900);
  assert.equal(await native.locator('.pet-bubble.visible').count(),0);
  results.push({label,name:actual.name,type:actual.type,sameConfig:true,randomReactions:true});
  await context.close();
}
console.log(JSON.stringify({routed,results},null,2));
await writeFile(`${root}/output/playwright/experience-native-results.json`,JSON.stringify({routed,results},null,2));
await browser.close();
await desktop.close();
