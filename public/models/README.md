# Local background-removal models

The Creator loads these files only when the user removes a photo background. Images are never sent to a model service. Both models run through ONNX Runtime Web in a dedicated Worker; keep these files on the same static host as the Creator.

- `modnet.onnx` — MODNet, portrait matting; 25.9 MB, fp32 ONNX conversion by Xenova. [Official project and model license](https://github.com/ZHKKKe/MODNet#license), [ONNX source](https://huggingface.co/Xenova/modnet/blob/main/onnx/model.onnx). SHA-256: `07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9`.
- `u2netp.onnx` — U²-NetP, general salient-object segmentation; 4.57 MB. [Official project](https://github.com/xuebinqin/U-2-Net), [rembg distribution](https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx). SHA-256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`; verified against rembg's expected MD5 `8e83ca70e441ab06c318d82300c84806`.

The Apache-2.0 license texts are included alongside each model. ONNX Runtime is MIT licensed; its license is included here too. Preprocessing follows each model's documented RGB normalization, output changes only source alpha.

Evaluated alternatives: [bg-remove](https://github.com/addyosmani/bg-remove) confirms browser-only WASM is practical. Its default [RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4) requires a separate commercial agreement for commercial use, so it is not bundled. A rembg Python server would add deployment infrastructure; this MVP reuses its U²-NetP model in the browser instead.

Known limits: MODNet is for people, so use the separate pets/objects choice for non-person photos. U²-NetP is a small 320px mask model and may miss fine fur or leave background near difficult boundaries. Portrait hair can retain the source background's color in semitransparent edge pixels. This is automatic matting, not a retouching editor.
