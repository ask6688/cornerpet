// With Vite running: playwright-cli run-code "$(cat tests/photo-demo.browser.js)"
// Default Demo must work with the AI API unavailable; no paid requests are made.
async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  let apiCalls = 0;
  await page.route('**/api/generate-pet', async route => { apiCalls++; await route.abort('failed'); });
  const stored = () => page.evaluate(async () => (await import('/creator/pet-storage.ts')).restoreLocalPet());
  const reports = [];
  try {
    for (const style of ['mochi', 'plush']) {
      await page.goto('http://127.0.0.1:5173/');
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.locator('.studio-welcome').waitFor();
      await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
      await page.getByRole('button', { name: '把生活里的它带回来', exact: true }).click();
      await page.getByLabel('上传照片', { exact: true }).setInputFiles('tests/samples/pet-cat.png');
      await page.getByAltText('你上传的原始照片', { exact: true }).waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('.style-picker img')].every(image => image.complete && image.naturalWidth > 0));
      assert(await page.getByRole('group', { name: '生成方式' }).count() === 0 && await page.locator('.generation-note').count() === 0, 'Demo controls appear before creation');
      await page.getByRole('button', { name: new RegExp(style === 'mochi' ? '糯米小团风格参考' : '口袋毛绒风格参考') }).click();
      await page.getByRole('button', { name: /创建我的桌角生物/ }).click();
      await page.getByRole('button', { name: /给它起个名字/ }).waitFor();
      assert(await page.locator('.generation-note').innerText().then(text => text.includes('没有配置图片生成 Key')), 'missing no-key disclosure after creation');
      assert(apiCalls === 0, 'Demo called the generation API');
      assert(await page.locator('.generation-result-note').innerText().then(text => text.includes('并非根据你的照片生成')), 'Demo provenance missing');
      assert(await page.locator('.image-pet').count() === 1, 'Demo image has no preview');
      assert(await page.getByRole('button', { name: /看看它的反应/ }).count() === 0, 'removed showcase button is still visible');
      await page.locator('.image-pet[data-motion="showcase"]').waitFor();
      assert(await page.locator('.pet-speech').count() === 0, 'Demo showcase displayed speech');
      assert(await page.getByRole('group', { name: '试试小心情', exact: true }).getByRole('button').count() === 5, 'five mood controls missing');
      if (style === 'mochi') {
        await page.screenshot({ path: 'output/playwright/p2-demo-flow.png', fullPage: true });
        await page.setViewportSize({ width: 320, height: 568 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow');
        await page.getByRole('button', { name: /给它起个名字/ }).scrollIntoViewIfNeeded();
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: 'output/playwright/p2-demo-mobile.png', fullPage: true });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator('.image-pet[data-reaction=""]').waitFor();
        await page.getByRole('button', { name: '擦掉多余的部分', exact: true }).click();
        const canvas = page.locator('.eraser-canvas canvas');
        await page.waitForFunction(() => document.querySelector('.eraser-canvas canvas')?.width > 0 && !document.querySelector('.eraser-apply')?.disabled);
        const point = await canvas.evaluate(c => {
          const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let y = Math.floor(c.height / 3); y < c.height * .7; y++) for (let x = Math.floor(c.width / 3); x < c.width * .7; x++) if (pixels[(y * c.width + x) * 4 + 3] > 240) return { x, y, width: c.width, height: c.height };
        });
        assert(point, 'Demo PNG is empty');
        const bounds = await canvas.boundingBox();
        await page.mouse.click(bounds.x + (point.x + .5) / point.width * bounds.width, bounds.y + (point.y + .5) / point.height * bounds.height);
        assert(await canvas.evaluate((c, p) => c.getContext('2d').getImageData(p.x, p.y, 1, 1).data[3], point) === 0, 'eraser failed');
        await page.getByRole('button', { name: '撤销一步', exact: true }).click();
        assert(await canvas.evaluate((c, p) => c.getContext('2d').getImageData(p.x, p.y, 1, 1).data[3], point) > 240, 'eraser undo failed');
        await page.getByRole('button', { name: '修好了', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        assert(await page.locator('.image-pet').getAttribute('data-reaction') === '', 'erasing an existing result replayed showcase');
        // Cancelling during PNG encoding or asset preparation must not apply a late edit.
        const originalAsset = await page.locator('.image-pet-face > image').getAttribute('href');
        for (const phase of ['encode', 'prepare']) {
          await page.getByRole('button', { name: '擦掉多余的部分', exact: true }).click();
          await page.waitForFunction(() => document.querySelector('.eraser-canvas canvas')?.width > 0 && !document.querySelector('.eraser-apply')?.disabled);
          await page.evaluate(phase => {
            const canvas = document.querySelector('.eraser-canvas canvas');
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            if (phase === 'encode') {
              window.p2OriginalToBlob = HTMLCanvasElement.prototype.toBlob;
              HTMLCanvasElement.prototype.toBlob = function(callback, ...args) { window.p2OriginalToBlob.call(this, blob => setTimeout(() => callback(blob), 500), ...args); };
            } else {
              window.p2OriginalBitmap = window.createImageBitmap;
              window.p2Preparing = false;
              window.createImageBitmap = async (...args) => { window.p2Preparing = true; const result = await window.p2OriginalBitmap(...args); await new Promise(resolve => setTimeout(resolve, 500)); return result; };
            }
          }, phase);
          await page.getByRole('button', { name: '修好了', exact: true }).click();
          if (phase === 'prepare') await page.waitForFunction(() => window.p2Preparing);
          await page.getByRole('button', { name: '关闭擦除工具', exact: true }).click();
          await page.waitForTimeout(700);
          await page.evaluate(() => {
            if (window.p2OriginalToBlob) { HTMLCanvasElement.prototype.toBlob = window.p2OriginalToBlob; delete window.p2OriginalToBlob; }
            if (window.p2OriginalBitmap) { window.createImageBitmap = window.p2OriginalBitmap; delete window.p2OriginalBitmap; }
            delete window.p2Preparing;
          });
          assert(await page.locator('.image-pet-face > image').getAttribute('href') === originalAsset, `cancel during ${phase} applied a stale image`);
          assert(await page.getByRole('button', { name: /给它起个名字/ }).isEnabled(), 'cancel left the flow busy');
        }
      }
      await page.getByRole('button', { name: /给它起个名字/ }).click();
      const name = page.getByRole('textbox', { name: '给它一个小名', exact: true });
      await name.fill(style === 'mochi' ? '示例糯糯' : '示例绒绒');
      await page.getByRole('button', { name: '保存这位伙伴', exact: true }).click();
      await page.locator('#name-feedback').getByText('已保存在这个浏览器，下次打开还能见到它', { exact: true }).waitFor();
      const pet = await stored();
      assert(pet.generationProvider === 'demo' && pet.faceRig?.eyes?.length === 2 && pet.style === style && pet.type === 'generated-pet', 'Demo metadata lost');
      const alpha = await page.evaluate(async image => {
        const bitmap = await createImageBitmap(await fetch(image).then(response => response.blob()));
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close();
        return context.getImageData(0, 0, 1, 1).data[3];
      }, pet.image2D);
      assert(alpha === 0, 'Demo PNG is not transparent');
      await page.reload();
      await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).click();
      await name.waitFor();
      assert(JSON.stringify(await stored()) === JSON.stringify(pet), 'refresh changed Demo identity or asset');
      reports.push(`${style}: bundled thumbnail → upload → Demo (zero API calls) → transparent preview → naming → local restore passed`);
    }
    await page.route('**/api/generation-capability', route => route.fulfill({ json: { configured: true } }));
    await page.goto('http://127.0.0.1:5173/');
    await page.locator('.studio-welcome').waitFor();
    await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
    await page.getByRole('button', { name: '把生活里的它带回来', exact: true }).click();
    await page.getByLabel('上传照片', { exact: true }).setInputFiles('tests/samples/pet-cat.png');
    await page.getByAltText('你上传的原始照片', { exact: true }).waitFor();
    assert(await page.getByRole('group', { name: '生成方式' }).count() === 0, 'manual provider choice remained');
    await page.getByRole('button', { name: /创建我的桌角生物/ }).click();
    await page.getByRole('alert').waitFor();
    assert(apiCalls === 1, 'real mode did not attempt the adapter');
    await page.getByRole('button', { name: '使用预置示例继续 →', exact: true }).click();
    await page.getByRole('button', { name: /给它起个名字/ }).waitFor();
    await page.locator('.image-pet[data-motion="showcase"]').waitFor();
    assert(await page.locator('.pet-speech').count() === 0, 'fallback showcase displayed speech');
    assert(apiCalls === 1, 'fallback called AI again');
    assert(await page.locator('.generation-result-note').innerText().then(text => text.includes('Demo 结果')), 'fallback hides Demo provenance');
    reports.push('Real service unavailable → explicit Demo fallback → usable result passed; no paid service called');
    return reports;
  } finally { await page.unroute('**/api/generation-capability'); await page.unroute('**/api/generate-pet'); }
}
