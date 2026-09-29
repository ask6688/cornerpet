// Production-only smoke: serve dist with a plain static server on :4174 (no AI API).
// Start the packaged CornerPet with --remote-debugging-port=9422.
// PLAYWRIGHT_MODULE can point at the existing Playwright tool installation.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { parsePetPackage } from '../shared/pet-config.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const exec = promisify(execFile);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const desktop = await chromium.connectOverCDP('http://127.0.0.1:9422');
const native = desktop.contexts()[0].pages()[0];
const reports = [];
try {
  for (const style of ['mochi', 'plush']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    let apiCalls = 0;
    page.on('request', request => { if (request.url().includes('/api/generate-pet')) apiCalls++; });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    // Replace only the browser's external-app confirmation, not native dispatch/transport.
    cdp.on('Page.frameRequestedNavigation', event => { if (event.url.startsWith('cornerpet://')) void exec('open', [event.url]); });
    await page.goto('http://127.0.0.1:4174/');
    await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
    await page.getByRole('button', { name: '把生活里的它带回来', exact: true }).click();
    await page.getByLabel('上传照片', { exact: true }).setInputFiles('tests/samples/pet-cat.png');
    await page.getByAltText('你上传的原始照片', { exact: true }).waitFor();
    await page.getByRole('button', { name: new RegExp(style === 'mochi' ? '糯米小团预置示例' : '口袋毛绒预置示例') }).click();
    await page.getByRole('button', { name: /请 Demo 小伙伴出场/ }).click();
    await page.getByRole('button', { name: /给它起个名字/ }).click();
    const name = style === 'mochi' ? '糯糯伙伴' : '绒绒伙伴';
    await page.getByRole('textbox', { name: '给它一个小名' }).fill(name);
    await page.getByRole('button', { name: '保存这位伙伴', exact: true }).click();
    await page.locator('#name-feedback').getByText('已保存在这个浏览器，下次打开还能见到它', { exact: true }).waitFor();
    await page.getByText('第一次见面 / 留一份小窝', { exact: true }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载小窝文件', exact: true }).click();
    const path = `output/playwright/p2-${style}.cornerpet`;
    await (await downloaded).saveAs(path);
    const expected = parsePetPackage(await readFile(path, 'utf8'));
    await page.getByRole('button', { name: '带它去桌面', exact: true }).click();
    await page.getByText(`CornerPet 已接住${name}，去桌角点它一下吧`, { exact: true }).waitFor({ timeout: 25000 });
    await native.locator('.image-pet-face').waitFor();
    const actual = await native.evaluate(() => window.cornerpet.getConfig());
    assert.deepEqual(actual, expected, 'PNG/identity/face landmarks/provenance differ in native App');
    await native.waitForTimeout(500);
    await native.screenshot({ path: `output/playwright/p2-native-${style}.png`, omitBackground: true });
    let previous = '';
    const seen = new Set();
    for (let i = 0; i < 8; i++) {
      await native.locator('.pet-grab').press('Enter');
      await native.waitForFunction(previous => { const value = document.querySelector('.image-pet')?.getAttribute('data-reaction'); return value && value !== previous; }, previous);
      const mood = await native.locator('.image-pet-face').getAttribute('data-face-mood');
      const reaction = await native.locator('.image-pet').getAttribute('data-reaction');
      assert.ok(mood && mood !== 'idle'); assert.notEqual(reaction, previous); previous = reaction; seen.add(mood);
      assert.ok(await native.locator('.pet-bubble').innerText());
    }
    await native.waitForTimeout(1900);
    assert.equal(await native.locator('.image-pet-face').getAttribute('data-face-mood'), 'idle');
    assert.equal(await native.locator('.pet-bubble.visible').count(), 0);
    assert.equal(apiCalls, 0);
    await page.screenshot({ path: `output/playwright/p2-handoff-${style}.png`, fullPage: true });
    reports.push({ style, staticDemo: true, apiCalls, sameNativePet: true, nativeMoodSamples: [...seen] });
    await context.close();
  }
  console.log(JSON.stringify(reports, null, 2));
  await writeFile('output/playwright/p2-native-results.json', JSON.stringify(reports, null, 2));
} finally { await browser.close(); await desktop.close(); }
