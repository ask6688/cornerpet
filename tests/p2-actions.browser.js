// Start Vite, then run with playwright-cli run-code "$(cat tests/p2-actions.browser.js)".
async page => {
  const assert = (value, note) => { if (!value) throw new Error(note); };
  await page.goto('http://127.0.0.1:5173/');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.studio-welcome').waitFor();
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click({ timeout: 25000 });
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  await page.locator('.pet-3d[data-reaction="showcase"]').waitFor();
  assert(await page.locator('.pet-speech').count() === 0, 'entering DIY displayed showcase speech');
  await page.locator('.pet-3d canvas').waitFor();
  assert(await page.getByRole('button', { name: /看看它的反应/ }).count() === 0, 'removed showcase button is still visible');
  const models = page.locator('.base-model-grid');
  const nextModel = models.locator('button[aria-pressed="false"]').first();
  await page.getByRole('button', { name: '害羞', exact: true }).click();
  await nextModel.click();
  assert(await page.locator('.pet-3d').getAttribute('data-reaction') === 'showcase', 'new shape did not showcase immediately');
  const before = await page.evaluate(() => localStorage.getItem('cornerpet:3d'));
  assert(await page.locator('.pet-speech').count() === 0, 'showcase retained the previous reaction speech');
  await page.locator('.pet-3d[data-reaction=""]').waitFor();
  assert(await page.evaluate(() => localStorage.getItem('cornerpet:3d')) === before, 'automatic showcase changed saved appearance');
  await models.locator('button[aria-pressed="true"]').click();
  await page.waitForTimeout(650);
  assert(await page.locator('.pet-3d').getAttribute('data-reaction') === '', 'same shape replayed showcase');
  for (const [label, id] of [['开心', 'happy'], ['困困', 'sleepy'], ['发呆', 'blank'], ['害羞', 'shy'], ['惊讶', 'surprised']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    assert(await page.locator('.pet-3d').getAttribute('data-reaction') === id, `missing ${id} reaction`);
    assert(await page.locator('.pet-speech').innerText(), `missing ${id} speech`);
  }
  await page.locator('.pet-3d[data-reaction=""]').waitFor();
  assert(await page.evaluate(() => localStorage.getItem('cornerpet:3d')) === before, 'temporary behavior changed saved appearance');
  for (let index = 0; index < 3; index++) {
    await models.locator('button[aria-pressed="false"]').first().click();
    assert(await page.locator('.pet-3d').getAttribute('data-reaction') === 'showcase', 'rapid shape switch did not showcase immediately');
    assert(await page.locator('.pet-speech').count() === 0, 'rapid showcase displayed speech');
  }
  const dock = page.getByRole('navigation', { name: '小生物定制' });
  await dock.getByRole('button', { name: '表情', exact: true }).click();
  for (const [label, mood] of [['偷偷开心', 'happy'], ['脑袋空空', 'blank']]) {
    await page.locator('.mood-pills').getByRole('button', { name: new RegExp(label) }).click();
    assert(await page.locator('.pet-3d').getAttribute('data-reaction') === '', 'static mood did not cancel the temporary reaction');
    assert(await page.locator('.pet-3d').getAttribute('data-face-mood') === mood, `static ${mood} face was not applied immediately`);
    assert(await page.locator('.pet-speech').count() === 0, 'static mood retained temporary speech');
    await page.waitForTimeout(650);
    assert(await page.locator('.pet-3d').getAttribute('data-face-mood') === mood, 'stale showcase replaced the selected face');
    await page.getByRole('group', { name: '试试小心情', exact: true }).getByRole('button', { name: '惊讶', exact: true }).click();
  }
  await page.locator('.mood-pills').getByRole('button', { name: /脑袋空空/ }).click();
  assert(await page.locator('.pet-3d').getAttribute('data-reaction') === '', 'reselecting a static mood did not cancel the reaction');
  await page.getByRole('button', { name: /回到桌角/ }).click();
  await page.locator('.welcome-pet .pet-3d[data-reaction="showcase"]').waitFor();
  assert(await page.locator('.pet-speech').count() === 0, 'returning home displayed showcase speech');
  await page.getByRole('button', { name: '领一只小东西回家', exact: true }).click();
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  await page.locator('.pet-3d[data-reaction="showcase"]').waitFor();
  await page.screenshot({ path: 'output/playwright/p2-custom-actions.png', fullPage: true });
  await page.getByRole('button', { name: /就是它了/ }).click();
  await page.getByRole('textbox', { name: '给它一个小名' }).fill('小小团');
  await page.getByRole('button', { name: '保存这位伙伴', exact: true }).click();
  await page.locator('#name-feedback').getByText('已保存在这个浏览器，下次打开还能见到它', { exact: true }).waitFor();
  const finished = await page.evaluate(async () => JSON.stringify(await (await import('/creator/pet-storage.ts')).restoreLocalPet()));
  await page.getByRole('button', { name: '开心', exact: true }).click();
  await page.locator('.pet-3d[data-reaction=""]').waitFor();
  assert(await page.evaluate(async () => JSON.stringify(await (await import('/creator/pet-storage.ts')).restoreLocalPet())) === finished, 'finished reaction changed saved companion');
  for (const [width, height] of [[320,568], [860,600], [1440,900]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
    await page.getByRole('button', { name: '带它去桌面', exact: true }).scrollIntoViewIfNeeded();
    await page.locator('.studio-footer').scrollIntoViewIfNeeded();
  }
  await page.reload();
  await page.locator('.welcome-pet .pet-3d[data-reaction="showcase"]').waitFor();
  assert(await page.locator('.pet-speech').count() === 0, 'saved companion home displayed showcase speech');
  await page.getByRole('button', { name: '让它继续陪伴你吧', exact: true }).click();
  assert(await page.getByRole('textbox', { name: '给它一个小名' }).inputValue() === '小小团', 'restore lost name');
  assert(await page.locator('.pet-3d').count() === 1, '3D renderer lost after restore');
  return 'Immediate silent home/DIY/shape showcases + same shape ignored + static face cancels reactions + five states + saved appearance unchanged + finish/restore + responsive passed';
}
