// Isolated session: verify full first-visit and saved-companion invitations without scrolling.
async page => {
  const results = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5173/');
  // This script owns an isolated browser profile, never the user's session
  await page.evaluate(async () => {
    localStorage.removeItem('cornerpet:created');
    localStorage.removeItem('cornerpet:photo');
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('cornerpet-companion');
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).waitFor();
  if (await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).count()) throw new Error('first-visit fixture not empty');
  for (const kind of ['first', '3d', 'photo']) {
    if (kind !== 'first') {
      await page.evaluate(async kind => {
        const { createPetModel } = await import('/shared/pet-config.mjs');
        const { savePetLocally } = await import('/creator/pet-storage.ts');
        let asset;
        if (kind === 'photo') {
          const blob = await (await fetch('/examples/mochi-sprout.png')).blob();
          asset = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
        }
        await savePetLocally(createPetModel({ name: '陪你发呆的小团子', type: kind === 'photo' ? 'image-pet' : 'procedural-3d', asset }));
      }, kind);
      await page.reload();
      await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).waitFor();
    }
    for (const [width, height] of [[1440, 1080], [1440, 900], [1280, 720], [1024, 768], [860, 600], [390, 844], [390, 667], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(150);
      await page.locator('.pet-preview [role=button]').first().press('Enter');
      await page.locator('.pet-speech[data-positioned=true]').waitFor();
      const metrics = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        const speech = box('.pet-speech'), stage = box('.pet-preview'), button = box('.story-start'), footer = box('.studio-footer');
        return { pageHeight: document.documentElement.scrollHeight, viewport: innerHeight, width: document.documentElement.scrollWidth,
          above: !document.querySelector('.pet-speech').classList.contains('below') && speech.top >= stage.top && speech.bottom < box('.welcome-caption, .story-invitation').top,
          ctaVisible: button.bottom <= innerHeight, footerVisible: footer.bottom <= innerHeight + 1, artHeight: box('.pet-preview-art').height };
      });
      results.push({ kind, width, height, ...metrics });
      if (metrics.pageHeight > height + 1 || metrics.width > width || !metrics.above || !metrics.ctaVisible || !metrics.footerVisible || metrics.artHeight < 80) throw new Error(JSON.stringify(results.at(-1)));
      await page.locator('.pet-preview [role=button]').first().evaluate(element => element.blur());
      if ((width === 1280 || width === 390) && kind === 'photo') await page.screenshot({ path: `output/playwright/home-fit-${width}-${height}.png` });
    }
  }
  return results;
}
