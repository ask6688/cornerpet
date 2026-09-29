async page => {
  const results = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click();
  async function measure(label) {
    for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768], [860, 600], [760, 768], [600, 800], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(100);
      const data = await page.evaluate(() => ({ documentHeight: document.documentElement.scrollHeight, documentWidth: document.documentElement.scrollWidth, viewport: innerHeight }));
      results.push({ label, width, height, ...data });
      if (data.documentHeight > height + 1) throw new Error('vertical overflow: ' + JSON.stringify(results.at(-1)));
      if (data.documentWidth > width) throw new Error('horizontal overflow: ' + JSON.stringify(results.at(-1)));
      if (width === 1280 || width === 600 || width === 390) await page.screenshot({ path: `output/playwright/window-fit-${label}-${width}.png`, fullPage: true });
    }
  }
  await measure('paths');
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  for (const tab of ['形态', '材质', '颜色', '表情', '配饰']) {
    await page.getByRole('navigation', { name: '小生物定制' }).getByRole('button', { name: tab, exact: true }).click();
    await measure(tab);
  }
  await page.getByRole('button', { name: /就是它了/ }).click();
  await measure('finish-3d');
  await page.getByRole('button', { name: '再创建一只', exact: true }).click();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click();
  await page.getByRole('button', { name: '把生活里的它带回来', exact: true }).click();
  await measure('photo-empty');
  await page.getByLabel('上传照片', { exact: true }).setInputFiles('tests/samples/pet-cat.png');
  await measure('photo-ready');
  await page.getByRole('button', { name: /保留它/ }).click();
  await measure('photo-original');
  await page.getByRole('button', { name: /捏成桌角生物/ }).click();
  await page.getByRole('button', { name: /请 Demo 小伙伴出场/ }).click();
  await page.getByRole('button', { name: /给它起个名字/ }).waitFor();
  await measure('photo-result');
  await page.getByRole('button', { name: '擦掉多余的部分', exact: true }).click();
  await page.locator('.eraser-dialog').waitFor();
  for (const [width, height] of [[1280, 720], [860, 600], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const box = await page.locator('.eraser-dialog').boundingBox();
    if (box.y < 0 || box.y + box.height > height + 1) throw new Error('eraser outside viewport');
  }
  await page.getByRole('button', { name: '关闭擦除工具', exact: true }).click();
  await page.getByRole('button', { name: /给它起个名字/ }).click();
  await measure('finish-photo');
  return results;
}
