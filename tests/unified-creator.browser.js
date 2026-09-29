// With Vite running: playwright-cli run-code "$(cat tests/unified-creator.browser.js)"
// Real local cutout/eraser + stubbed paid Doubao response. Never launches the native app.
async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const stored = () => page.evaluate(async () => (await import('/creator/pet-storage.ts')).restoreLocalPet());
  const png = await (await page.request.get('http://127.0.0.1:5173/examples/mochi-sprout.png')).body();
  const atlas = await (await page.request.get('http://127.0.0.1:5173/tests/samples/expression-atlas.png')).body();
  let generatedCalls = 0;
  let statusChecks = 0;
  await page.route('**/api/generation-capability', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/api/generate-pet', async route => {
    const input = route.request().postDataJSON();
    assert(input.style === 'mochi' && input.image.startsWith('data:image/png;base64,'), 'bad generation request');
    generatedCalls++;
    await route.fulfill({ status: 202, json: { id: '11111111-1111-4111-8111-111111111111' } });
  });
  await page.route('**/api/pet-generation*', async route => {
    const url = route.request().url();
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204 });
    if (url.includes('&asset=')) return route.fulfill({ contentType: 'image/png', body: url.includes('&asset=image') ? png : atlas });
    if (++statusChecks === 1) return route.fulfill({ status: 503, json: { error: 'temporary network failure' } });
    return route.fulfill({ json: { state: 'complete', model: 'qa-response-stub' } });
  });
  const reports = [];
  try {
    for (const mode of ['original', 'generated']) {
      await page.goto('http://127.0.0.1:5173/');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('.studio-welcome').waitFor();
      await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
      await page.getByRole('button', { name: '把生活里的它带回来', exact: true }).click();
      await page.getByLabel('上传照片', { exact: true }).setInputFiles('tests/samples/pet-cat.png');
      await page.getByAltText('你上传的原始照片', { exact: true }).waitFor();
      if (mode === 'original') {
        await page.getByRole('button', { name: /^保留它/ }).click();
        await page.getByRole('button', { name: '宠物 · 小物', exact: true }).click();
        await page.getByRole('button', { name: /把它留下来/ }).click();
        await page.getByRole('dialog', { name: '擦掉多余的部分' }).waitFor({ timeout: 120000 });
        await page.getByRole('button', { name: '修好了', exact: true }).waitFor();
        const canvas = page.locator('.eraser-canvas canvas');
        await page.waitForFunction(() => document.querySelector('.eraser-canvas canvas')?.width > 0 && !document.querySelector('.eraser-apply')?.disabled);
        const point = await canvas.evaluate(c => {
          const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let y = Math.floor(c.height / 3); y < c.height * .7; y++) for (let x = Math.floor(c.width / 3); x < c.width * .7; x++) if (pixels[(y * c.width + x) * 4 + 3] > 240) return { x, y, width: c.width, height: c.height };
        });
        assert(point, 'actual background removal returned an empty subject');
        await canvas.scrollIntoViewIfNeeded();
        const bounds = await canvas.boundingBox();
        await page.mouse.click(bounds.x + (point.x + .5) / point.width * bounds.width, bounds.y + (point.y + .5) / point.height * bounds.height);
        assert(await canvas.evaluate((c, p) => c.getContext('2d').getImageData(p.x, p.y, 1, 1).data[3], point) === 0, 'manual eraser did not erase');
        await page.getByRole('button', { name: '撤销一步', exact: true }).click();
        assert(await canvas.evaluate((c, p) => c.getContext('2d').getImageData(p.x, p.y, 1, 1).data[3], point) > 240, 'eraser undo did not restore');
        await page.setViewportSize({ width: 320, height: 568 });
        await page.getByRole('button', { name: '修好了', exact: true }).scrollIntoViewIfNeeded();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'eraser mobile overflow');
        await page.getByRole('button', { name: '修好了', exact: true }).click();
      } else {
        await page.getByRole('button', { name: '用照片真实生成', exact: true }).click();
        await page.getByRole('button', { name: '宠物 · 小物', exact: true }).click();
        await page.getByRole('button', { name: /创建我的桌角生物/ }).click();
      }
      await page.locator('.image-pet[data-motion="showcase"]').waitFor();
      assert(await page.locator('.pet-speech').count() === 0, `${mode} showcase displayed speech`);
      if (mode === 'generated') {
        await page.locator('.image-pet-atlas').waitFor();
        await page.getByRole('button', { name: '开心' }).click();
        assert(await page.locator('.image-pet-atlas').getAttribute('data-face-mood') === 'happy', 'generated expression did not change');
      }
      await page.getByRole('button', { name: /给它起个名字/ }).click();
      const name = page.getByRole('textbox', { name: '给它一个小名', exact: true });
      await page.locator('#name-feedback').getByText('已保存在这个浏览器，下次打开还能见到它', { exact: true }).waitFor();
      const initial = await stored();
      await name.fill(''); await page.waitForTimeout(600);
      assert(await name.inputValue() === '', 'clearing name restored default before editing finished');
      await page.getByRole('button', { name: '保存这位伙伴', exact: true }).click();
      assert(await name.getAttribute('aria-invalid') === 'true', 'empty name accepted');
      assert((await stored()).name === initial.name, 'empty name overwrote the saved pet');
      const finalName = mode === 'original' ? '小橘陪我' : '软软小橘';
      await name.dispatchEvent('compositionstart', { data: '' });
      await name.fill('xiaoju'); await page.waitForTimeout(650);
      assert((await stored()).name === initial.name, 'IME intermediate text was saved');
      await name.fill(finalName);
      await name.dispatchEvent('compositionend', { data: finalName });
      await page.getByRole('button', { name: '保存这位伙伴', exact: true }).click();
      await page.locator('#name-feedback').getByText('已保存在这个浏览器，下次打开还能见到它', { exact: true }).waitFor();
      const before = await stored();
      assert(before.name === finalName && before.source === 'upload' && before.model3D === null && before.thumbnail && before.type === (mode === 'original' ? 'image-pet' : 'generated-pet'), 'incomplete saved photo Pet');
      assert(before.generationProvider === (mode === 'generated' ? 'doubao' : null), 'wrong generation provenance');
      assert(mode === 'generated' ? before.expressionAtlas?.startsWith('data:image/png;base64,') : !before.expressionAtlas, 'expression asset did not persist');
      assert(await page.locator('.image-pet').count() === 1 && await page.locator('.pet-3d').count() === 0, 'PNG selected the wrong renderer');
      const alpha = await page.evaluate(async () => {
        const pet = await (await import('/creator/pet-storage.ts')).restoreLocalPet();
        const bitmap = await createImageBitmap(await fetch(pet.image2D).then(r => r.blob()));
        const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height;
        const ctx = c.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
        return ctx.getImageData(0, 0, 1, 1).data[3];
      });
      assert(alpha === 0, 'saved PNG has no transparent corner');
      await page.locator('.image-pet').click();
      const reaction = await page.locator('.image-pet').getAttribute('data-reaction');
      await page.waitForTimeout(220);
      await page.locator('.image-pet').click();
      assert(await page.locator('.image-pet').getAttribute('data-reaction') !== reaction, 'repeated same interaction');
      assert(JSON.stringify(await stored()) === JSON.stringify(before), 'interaction mutated saved config');
      await page.getByText('第一次见面 / 留一份小窝', { exact: true }).click();
      for (const [width, height] of [[320, 568], [1440, 900]]) {
        await page.setViewportSize({ width, height });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `finish overflow at ${width}`);
        await page.getByRole('button', { name: '下载小窝文件', exact: true }).scrollIntoViewIfNeeded();
        await page.locator('.studio-footer').scrollIntoViewIfNeeded();
        await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(150);
        await page.screenshot({ path: `output/playwright/experience-photo-${mode}-${width}.png`, fullPage: true });
      }
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: '下载小窝文件', exact: true }).click();
      await (await download).saveAs(`output/playwright/experience-photo-${mode}.cornerpet`);
      await page.reload();
      await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).click();
      await name.waitFor();
      const after = await stored();
      assert(after.petId === before.petId && after.createdTime === before.createdTime && after.name === finalName && after.image2D === before.image2D && after.expressionAtlas === before.expressionAtlas && after.type === before.type, 'refresh lost identity, PNG, or expressions');
      assert(await name.inputValue() === finalName, 'restored name missing from input');
      reports.push(`${mode}: transparent PNG → name + IME → IndexedDB save → random reaction → backup → refresh passed`);
    }
    assert(generatedCalls === 1, 'expected exactly one mocked Doubao request');
    return reports;
  } finally { await page.unroute('**/api/generation-capability'); await page.unroute('**/api/generate-pet'); await page.unroute('**/api/pet-generation*'); }
}
