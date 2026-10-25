# Person segmentation model

`u2netp.onnx` is the lightweight U²-Net portrait segmentation model used by the
offline lookboard renderer. It lets OUL remove the background from a user's
base photo locally, without sending the image to a third party, so the chosen
studio scene or custom background prompt still takes effect when Gemini image
generation is unavailable.

- Source: https://github.com/danielgatis/rembg/releases/tag/v0.0.0 (`u2netp.onnx`)
- MD5: `8e83ca70e441ab06c318d82300c84806`
- U²-Net upstream: https://github.com/xuebinqin/U-2-Net
- U²-Net license: Apache License 2.0
- rembg license: MIT

The model is 4.4 MB and runs locally through onnxruntime on CPU. Remove this
file and the `rembg` dependency if you prefer a Gemini-only deployment; the
renderer will fall back to a framed photo preview.
