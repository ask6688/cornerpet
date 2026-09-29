// Run after starting Vite:
// playwright-cli open http://127.0.0.1:5173/
// playwright-cli run-code "$(cat tests/photo-processing.browser.js)"
async page => {
  const result = await page.evaluate(async () => {
    const { preparePhoto } = await import('/creator/photo-processing.ts');
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    for (const file of [new File(['fake'], 'photo.png', { type: 'image/png' }), new File(['svg'], 'photo.svg', { type: 'image/svg+xml' }), new File([new Uint8Array(12 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' })]) {
      let rejected = false;
      try { await preparePhoto(file); } catch { rejected = true; }
      assert(rejected, 'Invalid image accepted');
    }
    const canvas = document.createElement('canvas');
    canvas.width = 2560; canvas.height = 1280;
    const context = canvas.getContext('2d');
    context.fillStyle = '#F4B9C5';
    context.fillRect(640, 320, 1280, 640);
    const original = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const blob = await preparePhoto(new File([original], 'valid.png', { type: 'image/png' }));
    const image = await createImageBitmap(blob);
    assert(image.width === 1280 && image.height === 640, 'Resize did not preserve aspect ratio / cap');
    assert(blob.type === 'image/png', 'Output must be PNG');
    canvas.width = image.width; canvas.height = image.height;
    context.drawImage(image, 0, 0);
    assert(context.getImageData(0, 0, 1, 1).data[3] === 0, 'Existing alpha was lost');
    assert(context.getImageData(640, 320, 1, 1).data[0] === 244, 'Foreground RGB was changed');
    image.close();
    return 'PASS: invalid type/signature/size rejected; resized PNG preserves aspect, alpha and RGB';
  });
  return result;
}
