// Isolated browser, real motion; verifies every page and both pet kinds with reserved speech space.
async page => {
  const results = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5173/');
  async function check(label) {
    for (const [width, height] of [[1440, 1080], [860, 600], [390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height });
      const actor = page.locator('.pet-preview [role=button]').first();
      await actor.scrollIntoViewIfNeeded();
      await actor.press('Enter');
      await page.locator('.pet-speech[data-positioned=true]').waitFor();
      const result = await page.evaluate(async () => {
        const checks = [];
        const start = performance.now();
        await new Promise(resolve => {
          function frame() {
            const speech = document.querySelector('.pet-speech[data-positioned=true]');
            if (speech) {
              const box = speech.getBoundingClientRect(), stage = speech.parentElement.getBoundingClientRect();
              const art = speech.parentElement.querySelector('.pet-preview-art').getBoundingClientRect();
              checks.push(!speech.classList.contains('below') && box.top >= stage.top && box.bottom <= stage.bottom && box.left >= stage.left && box.right <= stage.right + 1 && art.top - stage.top >= 80);
            }
            if (performance.now() - start < 650) requestAnimationFrame(frame); else resolve();
          }
          requestAnimationFrame(frame);
        });
        return { above: checks.length > 10 && checks.every(Boolean), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      if (!result.above || result.overflow) throw new Error(JSON.stringify({ label, width, result }));
      results.push({ label, width, ...result });
      if (width === 1440 || width === 390) await page.screenshot({ path: `output/playwright/headroom-${label}-${width}.png`, fullPage: true });
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await check('home-3d');
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click();
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  await check('custom');
  await page.getByRole('button', { name: /就是它了/ }).click();
  await check('finish-3d');
  await page.getByRole('button', { name: '再创建一只' }).click();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click();
  await page.getByRole('button', { name: '把生活里的它带回来', exact: true }).click();
  await page.getByLabel('上传照片', { exact: true }).setInputFiles('tests/samples/pet-cat.png');
  await page.getByRole('button', { name: /请 Demo 小伙伴出场/ }).click();
  await page.getByRole('button', { name: /给它起个名字/ }).waitFor();
  await check('photo');
  await page.getByRole('button', { name: /给它起个名字/ }).click();
  await check('finish-photo');
  await page.getByLabel('给它一个小名', { exact: true }).fill('小小陪伴');
  await page.getByRole('button', { name: '保存这位伙伴', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#name-feedback')?.textContent?.includes('自动保存'));
  await page.reload();
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).waitFor();
  await check('home-photo');
  return results;
}
