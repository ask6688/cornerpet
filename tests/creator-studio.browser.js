// With Vite running: playwright-cli run-code "$(cat tests/creator-studio.browser.js)"
async page => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.goto('http://127.0.0.1:5173/');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.studio-welcome').waitFor();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  const canvas = await page.locator('canvas').elementHandle();
  const dock = page.getByRole('navigation', { name: '小生物定制' });
  const options = page.locator('#studio-options');
  const counts = { '材质': 4, '颜色': 12, '表情': 9, '配饰': 4 };
  assert(await page.locator('.specimen-label small').count() === 0, 'old appearance summary is still visible');
  assert((await page.locator('.orbit-hint').innerText()).includes('你可以点点我哦'), 'gentle interaction hint missing');
  await page.locator('.base-model-grid').getByRole('button', { name: '糯米团', exact: true }).click();
  for (const [label, choice] of [['材质', /QQ 果冻/], ['颜色', /樱花麻薯/], ['表情', /偷偷开心/], ['配饰', /星星别针/]]) {
    await dock.getByRole('button', { name: label, exact: true }).click();
    assert(await options.getByRole('button').count() === counts[label], `${label} option count changed`);
    if (label === '表情') assert(await options.getByRole('button', { name: /不太想动/ }).count() === 0, 'legacy still mood remains in the UI');
    await options.getByRole('button', { name: choice }).click();
  }
  await dock.getByRole('button', { name: '颜色', exact: true }).click();
  for (const [label, palette] of [['焦糖布丁', 'caramel-pudding'], ['黑芝麻牛乳', 'sesame-paste'], ['樱花麻薯', 'sakura-mochi']]) {
    await options.getByRole('button', { name: label, exact: true }).click();
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('cornerpet:3d')).model3D.palette) === palette, `${label} did not persist`);
  }
  assert(await page.evaluate(async () => (await import('/shared/pet-config.mjs')).normalizePetConfig({ mood: 'still' }).mood) === 'still', 'legacy still mood is no longer readable');
  if (!await canvas.evaluate(node => node.isConnected)) throw new Error('Preview remounted during category navigation');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cornerpet:3d')));
  if (saved.model3D.accessory !== 'starpin' || saved.model3D.palette !== 'sakura-mochi' || saved.model3D.mood !== 'happy' || saved.model3D.material !== 'jelly') throw new Error('Combined choices lost');
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'output/playwright/studio-colors.png', fullPage: true });
  for (const width of [320, 390, 860]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of ['颜色', '表情', '配饰']) {
      await dock.getByRole('button', { name: label, exact: true }).click();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} overflow at ${width}px`);
      assert(await options.getByRole('button').count() === counts[label], `${label} options missing at ${width}px`);
    }
    await page.screenshot({ path: `output/playwright/studio-options-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await dock.getByRole('button', { name: '颜色', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/studio-mobile.png', fullPage: true });
  await page.getByRole('button', { name: /就是它了 · 起个名字/ }).click();
  await page.getByRole('textbox', { name: '给它一个小名' }).fill('小星团');
  if (await page.locator('.pet-3d canvas').count() !== 1) throw new Error('3D finish missing renderer');
  const downloaded = page.waitForEvent('download');
  await page.getByText('第一次见面 / 留一份小窝', { exact: true }).click();
  await page.getByRole('button', { name: '下载小窝文件', exact: true }).click();
  await (await downloaded).saveAs('output/playwright/studio-custom.cornerpet');
  await page.reload();
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).click();
  await page.getByRole('textbox', { name: '给它一个小名' }).waitFor();
  return 'PASS: 12 colors + 9 moods + 4 accessories + starpin/added colors persist + legacy mood reads + updated hint/summary + canvas preserved + 320/390/860 layout + naming/backup/restore';
}
