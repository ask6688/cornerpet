// Run with playwright_cli.sh -s=models run-code "$(cat tests/base-models.browser.js)"
async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('http://127.0.0.1:5173/');
  const models = await page.evaluate(async () => (await import('/shared/pet-models.mjs')).BASE_MODELS);
  for (const model of models) {
    await page.evaluate(async (model) => {
      const { createPetModel } = await import('/shared/pet-config.mjs');
      localStorage.setItem('cornerpet:3d', JSON.stringify(createPetModel({ source: 'custom', shape: model.value, palette: model.palette, material: model.material, mood: 'blank', accessory: 'none', name: model.label })));
    }, model);
    await page.reload();
    await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
    await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`3D${model.label}桌角生物`) }).waitFor();
    await page.waitForTimeout(1000);
    await page.locator('.creature-display').screenshot({ path: `output/playwright/base-${model.value}.png` });
    await page.getByRole('navigation', { name: '小生物定制' }).getByRole('button', { name: '材质', exact: true }).click();
    // One choice group at a time; category navigation preserves all earlier choices.
    if (await page.getByRole('button', { name: '海盐苏打', exact: true }).count()) throw new Error('Color options leaked into material step');
    await page.getByRole('button', { name: /玻璃糖/ }).click();
    await page.getByRole('navigation', { name: '小生物定制' }).getByRole('button', { name: '颜色', exact: true }).click();
    await page.getByRole('button', { name: '海盐苏打', exact: true }).click();
    await page.getByRole('navigation', { name: '小生物定制' }).getByRole('button', { name: '表情', exact: true }).click();
    await page.getByRole('button', { name: /Wink/i }).click();
    await page.getByRole('navigation', { name: '小生物定制' }).getByRole('button', { name: '配饰', exact: true }).click();
    await page.getByRole('button', { name: /一朵花/ }).click();
    await page.waitForTimeout(700);
    await page.locator('.creature-display').screenshot({ path: `output/playwright/custom-${model.value}.png` });
    await page.getByRole('button', { name: /就是它了 · 起个名字/ }).click();
    await page.getByRole('textbox', { name: '给它一个小名' }).fill(`测试${model.label}`);
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('第一次见面 / 留一份小窝', { exact: true }).click();
    await page.getByRole('button', { name: '下载小窝文件', exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(`output/playwright/base-${model.value}.cornerpet`);
    const saved = await page.evaluate(async () => {
      const { restoreLocalPet } = await import('/creator/pet-storage.ts');
      return restoreLocalPet();
    });
    if (saved.model3D.shape !== model.value || saved.model3D.accessory !== 'flower' || saved.model3D.mood !== 'wink' || !saved.image2D || !saved.thumbnail) throw new Error(`Lost config/PNG: ${model.value}`);
  }
  // Rapid switches, persistence and keeping a single Canvas rather than remounting it.
  await page.getByRole('button', { name: '再创建一只', exact: true }).click();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  const canvas = await page.locator('canvas').elementHandle();
  for (const model of models) await page.getByRole('button', { name: new RegExp(model.label) }).click();
  await page.getByRole('button', { name: /就是它了 · 起个名字/ }).waitFor({ state: 'visible' });
  await page.waitForTimeout(700);
  if (!await canvas.evaluate(node => node.isConnected)) throw new Error('Canvas was remounted');
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 260, box.y + box.height / 2, { steps: 20 }); await page.mouse.up();
  await page.mouse.wheel(0, -100);
  await page.locator('.creature-display').screenshot({ path: 'output/playwright/base-orbit.png' });
  await page.reload();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  if (await page.getByRole('button', { name: /小蘑菇/ }).getAttribute('aria-pressed') !== 'true') throw new Error('Shape draft lost on reload');
  await page.screenshot({ path: 'output/playwright/base-library.png', fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
}
