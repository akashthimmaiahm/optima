const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const LOGO = path.join(__dirname, '../../frontend/src/assets/optima-logo.png');
const OUT_DIR = __dirname;

// Create BMP file from raw RGB pixel data
function createBMP(width, height, rgbBuffer) {
  const rowSize = Math.ceil((width * 3) / 4) * 4; // rows padded to 4 bytes
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const bmp = Buffer.alloc(fileSize);

  // BMP Header (14 bytes)
  bmp.write('BM', 0);
  bmp.writeUInt32LE(fileSize, 2);
  bmp.writeUInt32LE(0, 6);
  bmp.writeUInt32LE(54, 10);

  // DIB Header (40 bytes)
  bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(width, 18);
  bmp.writeInt32LE(height, 22); // positive = bottom-up
  bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); // 24-bit
  bmp.writeUInt32LE(0, 30);
  bmp.writeUInt32LE(pixelDataSize, 34);
  bmp.writeInt32LE(2835, 38);
  bmp.writeInt32LE(2835, 42);
  bmp.writeUInt32LE(0, 46);
  bmp.writeUInt32LE(0, 50);

  // Pixel data (bottom-up, BGR)
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 3; // flip vertically
    const dstRow = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const srcIdx = srcRow + x * 3;
      const dstIdx = dstRow + x * 3;
      bmp[dstIdx + 0] = rgbBuffer[srcIdx + 2]; // B
      bmp[dstIdx + 1] = rgbBuffer[srcIdx + 1]; // G
      bmp[dstIdx + 2] = rgbBuffer[srcIdx + 0]; // R
    }
  }
  return bmp;
}

async function main() {
  // Wizard image (left panel): 164x314 - dark background with logo centered
  const W1 = 164, H1 = 314;
  const wizard = await sharp({
    create: { width: W1, height: H1, channels: 3, background: { r: 20, g: 20, b: 40 } }
  })
    .composite([{
      input: await sharp(LOGO)
        .resize(130, 55, { fit: 'contain', background: { r: 20, g: 20, b: 40, alpha: 1 } })
        .flatten({ background: { r: 20, g: 20, b: 40 } })
        .toBuffer(),
      top: 130,
      left: 17,
    }])
    .removeAlpha()
    .raw()
    .toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, 'installer-wizard.bmp'), createBMP(W1, H1, wizard));
  console.log('Created: installer-wizard.bmp (164x314)');

  // Small image (top-right): 55x55 - white background with logo
  const W2 = 55, H2 = 55;
  const small = await sharp(LOGO)
    .resize(50, 50, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: '#ffffff' })
    .extend({ top: 2, bottom: 3, left: 2, right: 3, background: '#ffffff' })
    .resize(W2, H2)
    .removeAlpha()
    .raw()
    .toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, 'installer-small.bmp'), createBMP(W2, H2, small));
  console.log('Created: installer-small.bmp (55x55)');
}

main().catch(err => console.error(err));
