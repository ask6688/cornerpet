// Run in an isolated Playwright session; keep actual motion enabled to catch side flips.
async page => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click();
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const results = [];
  async function sample(label) {
    return page.evaluate(async label => {
      const points = [];
      [...document.querySelectorAll('button')].find(button => button.textContent === label).click();
      const start = performance.now();
      await new Promise(resolve => {
        function frame() {
          const el = document.querySelector('.pet-speech[data-positioned=true]');
          if (el) {
            const bubble = el.getBoundingClientRect(), stage = el.parentElement.getBoundingClientRect();
            points.push({ top: parseFloat(el.style.top), below: el.classList.contains('below'),
              contained: bubble.left >= stage.left && bubble.right <= stage.right + 1 && bubble.top >= stage.top && bubble.bottom <= stage.bottom + 1 });
          }
          if (performance.now() - start < 1600) requestAnimationFrame(frame); else resolve();
        }
        requestAnimationFrame(frame);
      });
      let flips = 0, maxStep = 0;
      for (let i = 1; i < points.length; i++) {
        flips += Number(points[i].below !== points[i - 1].below);
        maxStep = Math.max(maxStep, Math.abs(points[i].top - points[i - 1].top));
      }
      if (points.length < 20 || flips || maxStep > 15 || points.some(point => !point.contained)) throw new Error(JSON.stringify({ label, frames: points.length, flips, maxStep }));
      return { label, frames: points.length, flips, maxStep };
    }, label);
  }
  for (const width of [390, 760, 1024]) {
    await page.setViewportSize({ width, height: 640 });
    for (const shape of ['糯米团', '小蘑菇', '布丁']) {
      await page.getByRole('navigation', { name: '小生物定制' }).getByRole('button', { name: '形态', exact: true }).click();
      await page.locator('.base-model-grid').getByRole('button', { name: shape, exact: true }).click();
      await page.locator('.pet-3d[data-reaction=""]').waitFor();
      for (const action of ['开心', '惊讶']) results.push({ width, shape, ...await sample(action) });
    }
  }
  await page.getByRole('button', { name: /回到桌角/ }).click();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click();
  await page.getByRole('button', { name: '把生活里的它带回来', exact: true }).click();
  await page.getByLabel('上传照片', { exact: true }).setInputFiles('tests/samples/pet-cat.png');
  await page.getByRole('button', { name: /请 Demo 小伙伴出场/ }).click();
  await page.locator('.image-pet[data-motion="showcase"]').waitFor();
  for (const width of [320, 760]) {
    await page.setViewportSize({ width, height: 640 });
    for (const action of ['开心', '惊讶']) results.push({ width, shape: 'photo', ...await sample(action) });
  }
  // A resize may choose a new side, but subsequent animated frames keep it.
  await page.getByRole('button', { name: '开心', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 640 });
  results.push({ width: 390, shape: 'photo-after-resize', ...await sample('开心') });
  await page.getByRole('button', { name: '开心', exact: true }).click();
  await page.waitForTimeout(200);
  await page.locator('.preview').screenshot({ path: 'output/playwright/speech-stable-photo-small.png' });
  await page.locator('.pet-speech').waitFor({ state: 'hidden' });
  if (await page.locator('[data-pet-bounds]').count()) throw new Error('measurement was not cleaned up');
  return results;
}
