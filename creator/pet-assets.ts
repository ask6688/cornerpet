/** Reuse the same PNG/thumbnail path for photos and a snapshot of the 3D viewer. */
export async function petImageAssets(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    function render(edge: number) {
      const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器无法准备桌宠图片，请重试');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    }
    return { image2D: render(1280), thumbnail: render(160) };
  } finally { bitmap.close(); }
}
