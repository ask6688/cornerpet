// Isolated session against Vite; no writes to the user's companion or native Runtime.
async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click();
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  const dock = page.getByRole('navigation', { name: '小生物定制' });
  for (const [shape, label] of [['strawberry', '草莓团'], ['mushroom', '小蘑菇'], ['pudding', '布丁']]) {
    await dock.getByRole('button', { name: '形态', exact: true }).click();
    await page.locator('.base-model-grid').getByRole('button', { name: label, exact: true }).click();
    await page.locator('.pet-3d[data-reaction=""]').waitFor();
    await dock.getByRole('button', { name: '配饰', exact: true }).click();
    for (const [accessory, name] of [['flower', '一朵花'], ['bow', '小蝴蝶结']]) {
      await page.locator('.accessory-pills').getByRole('button', { name: new RegExp(name) }).click();
      await page.setViewportSize({ width: 1281, height: 1000 });
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.waitForTimeout(250);
      await page.locator('.creature-display').screenshot({ path: `output/playwright/fit-${shape}-${accessory}-front.png` });
      const canvas = await page.locator('.pet-3d canvas').boundingBox();
      await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
      await page.mouse.down();
      await page.mouse.move(canvas.x + canvas.width / 2 - 65, canvas.y + canvas.height / 2 + 20, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(350);
      await page.locator('.creature-display').screenshot({ path: `output/playwright/fit-${shape}-${accessory}-side.png` });
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { combinations: 6, views: ['front', 'side'], canvasCount: await page.locator('canvas').count(), errors };
}
