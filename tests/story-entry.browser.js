// Run with playwright-cli run-code --filename=tests/story-entry.browser.js.
// Isolated browser data only; never contacts the desktop or an image API.
async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const context = await page.context().browser().newContext({
    viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference',
    recordVideo: { dir: 'output/playwright/story-recording', size: { width: 1280, height: 800 } },
  });
  const opening = await context.newPage();
  opening.on('pageerror', error => errors.push(error.message));
  const video = opening.video();
  try {
    await opening.goto('http://127.0.0.1:5173/');
    await opening.locator('[data-story-beat="0"]').waitFor();
    assert(await opening.getByRole('button', { name: '领一只小东西回家', exact: true }).count() === 0, 'functional entry interrupts opening');
    await opening.waitForTimeout(250);
    await opening.screenshot({ path: 'output/playwright/story-01-empty.png' });
    await opening.locator('[data-story-beat="1"]').waitFor({ timeout: 5000 });
    assert(await opening.getByRole('heading', { name: '后来...', exact: true }).count() === 1, 'later beat copy changed');
    await opening.locator('[data-story-beat="2"]').waitFor({ timeout: 4000 });
    assert(await opening.locator('.just-arrived').count() === 1, 'arrival animation missing');
    await opening.waitForTimeout(550);
    await opening.screenshot({ path: 'output/playwright/story-02-arrival.png' });
    await opening.locator('[data-story-beat="3"] .pet-3d[data-state="short-idle"]').waitFor({ timeout: 5000 });
    await opening.locator('[data-story-beat="4"] .pet-3d[data-state="sleep"]').waitFor({ timeout: 5000 });
    await opening.waitForTimeout(300);
    await opening.screenshot({ path: 'output/playwright/story-03-sleep.png' });
    await opening.locator('[data-story-beat="home"]').waitFor({ timeout: 5000 });
    await opening.locator('.welcome-pet .pet-3d[data-reaction="showcase"]').waitFor();
    assert(await opening.locator('.pet-speech').count() === 0, 'opening completion displayed showcase speech');
    await opening.waitForTimeout(2800);
    await opening.locator('.welcome-pet .pet-3d[data-reaction=""]').waitFor();
    await opening.screenshot({ path: 'output/playwright/story-04-invitation.png' });
  } finally { await context.close(); }
  await video.saveAs('output/playwright/story-opening.webm');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('[data-story-beat="0"]').waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  const next = page.getByRole('button', { name: '继续这个小故事', exact: true });
  for (let beat = 0; beat < 5; beat++) {
    assert(await page.locator(`[data-story-beat="${beat}"]`).count() === 1, `click skipped story beat ${beat}`);
    await next.click();
    await page.locator(`[data-story-beat="${beat === 4 ? 'home' : beat + 1}"]`).waitFor();
  }
  await page.locator('.welcome-pet .pet-3d[data-reaction="showcase"]').waitFor();
  assert(await page.locator('.pet-speech').count() === 0, 'click completion displayed showcase speech');
  assert(await next.count() === 0, 'story advance still covers the home invitation');

  await page.clock.resume();
  await page.reload();
  await page.locator('[data-story-beat="0"]').waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.clock.runFor(1200);
  await next.click();
  await page.locator('[data-story-beat="1"]').waitFor();
  await page.clock.runFor(1999);
  assert(await page.locator('[data-story-beat="1"]').count() === 1, 'clicked beat did not get its full dwell');
  await page.clock.runFor(1);
  await page.locator('[data-story-beat="2"]').waitFor();
  await page.clock.runFor(500);
  assert(await page.locator('[data-story-beat="2"]').count() === 1, 'old beat timer changed the current beat');

  await page.clock.resume();
  await page.reload();
  await page.locator('[data-story-beat="0"]').waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await next.focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-story-beat="1"]').waitFor();
  assert(await next.evaluate(node => node === document.activeElement), 'Enter lost story keyboard focus');
  await page.keyboard.press('Space');
  await page.locator('[data-story-beat="2"]').waitFor();
  const skip = page.getByRole('button', { name: '跳过这小段', exact: true });
  assert(await skip.evaluate(node => !node.closest('.story-next')), 'skip is nested inside story advance');
  await skip.click();
  const start = page.getByRole('button', { name: '领一只小东西回家', exact: true });
  await start.waitFor();
  await page.clock.runFor(20);
  assert(await start.evaluate(node => node === document.activeElement), 'skip did not focus the home invitation');
  await page.locator('.welcome-pet .pet-3d[data-reaction="showcase"]').waitFor();
  assert(await page.locator('.pet-speech').count() === 0, 'skip displayed showcase speech');
  const before = await page.evaluate(async () => (await import('/creator/pet-storage.ts')).restoreLocalPet());
  assert(before === null, 'test session unexpectedly has a saved pet');
  await page.clock.runFor(16500);
  assert(await page.locator('[data-story-beat="home"]').count() === 1, 'skipped timers returned to story');
  await page.clock.resume();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await start.waitFor();
  assert(await page.locator('.is-opening').count() === 0, 'reduced motion still waits through animation');
  await start.click();
  assert(await page.locator('#paths-title').evaluate(node => node === document.activeElement), 'path heading not focused');
  for (const [width, height] of [[1440, 900], [900, 600], [760, 600], [560, 700], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `paths overflow ${width}`);
    await page.screenshot({ path: `output/playwright/story-paths-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: '从想象里长出来', exact: true }).click();
  await page.getByRole('heading', { name: '让一点想象，长出模样' }).waitFor();
  await page.getByRole('button', { name: /回到桌角/ }).click();
  await start.waitFor();
  assert(await page.locator('.is-opening').count() === 0, 'returning from creator replays opening');
  await start.click();
  await page.getByRole('button', { name: '把生活里的它带回来', exact: true }).click();
  await page.getByRole('heading', { name: '带一个喜欢的它来' }).waitFor();
  await page.getByRole('button', { name: /回到桌角/ }).click();
  await start.click();
  await page.getByRole('button', { name: /回到小桌角/ }).click();
  await page.waitForFunction(() => document.activeElement?.classList.contains('story-start'));
  for (const [width, height] of [[1440, 900], [900, 600], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `home overflows ${width}`);
    await page.screenshot({ path: `output/playwright/story-home-${width}.png`, fullPage: true });
  }
  assert(await page.evaluate(async () => (await import('/creator/pet-storage.ts')).restoreLocalPet()) === null, 'landing modified saved pet');
  assert(errors.length === 0, errors.join('\n'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return { opening: 'empty → arrival → daydream → sleep → home', clickEachBeat: true, keyboard: ['Enter', 'Space'], timerReset: true, skip: true, silentHomeShowcase: true, reducedMotion: true, paths: ['custom', 'photo'], noPetWrites: true, responsive: true, errors };
}
