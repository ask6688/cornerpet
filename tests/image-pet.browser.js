// Run with playwright-cli run-code, against the Vite development server.
async page => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { PetRenderer } = await import('/shared/PetRenderer.tsx');
    const { DEMO_FACE_RIGS } = await import('/shared/image-face-rigs.mjs');
    const host = document.createElement('div'); host.id = 'image-behavior-test';
    host.style.cssText = 'position:fixed;inset:0;background:#f8f4ec;z-index:99999;width:500px;height:600px';
    document.body.appendChild(host); const root = createRoot(host); let instanceId = 0;
    const blob = await (await fetch('/examples/mochi-sprout.png')).blob();
    const asset = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
    window.renderImageBehavior = (mood, motion = 'hop', calibrated = true, image = asset) => root.render(React.createElement(PetRenderer, {
      config: { name: '图片伙伴', image2D: image, model3D: null, faceRig: calibrated ? DEMO_FACE_RIGS.mochi : null, scale: 1 },
      reaction: mood ? { id: mood, mood, motion, instanceId: ++instanceId, duration: motion === 'showcase' ? 2600 : 1800 } : null,
    }));
    window.imageBehaviorAsset = asset; window.imageBehaviorRig = DEMO_FACE_RIGS.mochi;
    window.renderImageBehavior(null);
  });
  const host = page.locator('#image-behavior-test');
  await host.locator('.image-pet-blink').waitFor({ state: 'attached' });
  assert(await host.locator('.image-pet-blink').evaluate(el => {
    const animation = el.getAnimations()[0]; animation.pause(); animation.currentTime = 5450;
    return getComputedStyle(el).opacity === '1';
  }), 'Calibrated PNG does not blink');
  const faces = new Set();
  for (const mood of ['happy', 'sleepy', 'blank', 'shy', 'spotted']) {
    await page.evaluate(mood => window.renderImageBehavior(mood), mood);
    await host.locator(`[data-face-mood="${mood}"]`).waitFor();
    faces.add(await host.locator('.image-pet-expression').innerHTML());
  }
  assert(faces.size === 5, 'PNG expressions are not distinct');
  await page.evaluate(() => window.renderImageBehavior('happy', 'showcase'));
  await host.locator('[data-motion="showcase"]').waitFor();
  const transforms = await host.locator('.image-pet-motion').evaluate(el => {
    const animation = el.getAnimations()[0]; animation.pause();
    return [650, 1500, 2450, 2599].map(time => { animation.currentTime = time; return getComputedStyle(el).transform; });
  });
  assert(transforms[0] !== transforms[1], 'Hop / turn does not move PNG');
  assert(transforms[2] === transforms[3], 'Showcase turns backwards while ending');
  await page.evaluate(() => window.renderImageBehavior('happy', 'hop', false));
  await host.locator('img').waitFor();
  assert(await host.locator('svg').count() === 0, 'Unknown photos must not get guessed faces');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert(await host.locator('.image-pet-motion').evaluate(el => getComputedStyle(el).animationName) === 'none', 'Reduced motion ignored');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Editing the alpha must also erase face overlays, not reveal the donor skin patch.
  await page.evaluate(async () => {
    const original = new Image(); original.src = window.imageBehaviorAsset; await original.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1254;
    const context = canvas.getContext('2d'); context.drawImage(original, 0, 0);
    context.clearRect(400, 600, 76, 78); window.renderImageBehavior('happy', 'hop', true, canvas.toDataURL('image/png'));
  });
  await host.locator('svg').waitFor();
  const alpha = await host.locator('svg').evaluate(async el => {
    const svg = el.cloneNode(true); svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', '1254'); svg.setAttribute('height', '1254');
    const image = new Image(); image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)); await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1254;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return context.getImageData(438, 639, 1, 1).data[3];
  });
  assert(alpha === 0, 'Face overlay resurrects erased PNG pixels');
  console.log('PASS PNG blink, 5 faces, hop/turn/return, original photo identity, reduced motion and erased alpha');
}
