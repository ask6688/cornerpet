// Isolated browser only; no desktop handoff or image service calls.
async page => {
  const assert = (value, note) => { if (!value) throw new Error(note); };
  const speech = page.locator('.pet-speech[data-positioned="true"]');
  const contained = () => speech.evaluate(element => {
    const bubble = element.getBoundingClientRect(), stage = element.parentElement.getBoundingClientRect();
    return bubble.left >= stage.left && bubble.right <= stage.right + 1 && bubble.top >= stage.top && bubble.bottom <= stage.bottom + 1;
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5173/');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  // Use an unclamped silhouette: a tall saved pet may correctly pin speech to the viewport edge.
  await page.locator('.base-model-grid').getByRole('button', { name: '云朵', exact: true }).click();
  await page.getByRole('button', { name: '配饰', exact: true }).click();
  await page.getByRole('button', { name: /什么都不带/ }).click();
  await page.locator('.pet-3d[data-reaction=""]').waitFor();
  await page.getByRole('button', { name: '困困', exact: true }).click();
  await speech.waitFor();
  const before = await speech.boundingBox();
  await page.locator('.pet-3d canvas').hover();
  await page.mouse.wheel(0, 450);
  await page.waitForTimeout(450);
  const after = await speech.boundingBox();
  assert(after && Math.abs(before.y - after.y) > 3, '3D speech stayed fixed while zoom changed');
  assert(await contained(), '3D speech is clipped');
  await page.screenshot({ path: 'output/playwright/corner-speech-zoom.png', fullPage: true });
  await page.getByRole('button', { name: /回到桌角/ }).click();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click();
  await page.getByRole('button', { name: '把生活里的它带回来', exact: true }).click();
  await page.getByLabel('上传照片', { exact: true }).setInputFiles('tests/samples/pet-cat.png');
  await page.getByRole('button', { name: /创建我的桌角生物/ }).click();
  await page.locator('.image-pet[data-motion="showcase"]').waitFor();
  assert(await page.locator('.pet-speech').count() === 0, 'automatic showcase displayed a bubble');
  await page.getByRole('button', { name: '开心', exact: true }).click();
  await speech.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-pet-bounds]')?.style.width !== '100%');
  const imageAnchor = await page.locator('[data-pet-bounds]').boundingBox();
  const bubble = await speech.boundingBox();
  assert(Math.abs(imageAnchor.x + imageAnchor.width / 2 - bubble.x - bubble.width / 2) < 2, 'PNG bubble does not follow the visible subject');
  assert(await contained(), 'PNG speech is clipped');
  await page.screenshot({ path: 'output/playwright/corner-photo-speech.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: '开心', exact: true }).click();
  await speech.waitFor();
  assert(await contained(), 'mobile speech is clipped');
  await page.screenshot({ path: 'output/playwright/corner-photo-speech-mobile.png', fullPage: true });
  await speech.waitFor({ state: 'hidden' });
  assert(await page.locator('[data-pet-bounds]').count() === 0, 'PNG measurement remained active after speech ended');
  return '3D zoom anchor + PNG alpha anchor + mobile clamping + idle measurement cleanup passed';
}
