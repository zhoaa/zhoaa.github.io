// Mechanical extraction from the user-provided Duck Hunt sheet.
// Run with sharp available on NODE_PATH.
const sharp = require('sharp');
const path = require('node:path');
async function main() {
  const root = path.resolve(__dirname, '..');
  const { data, info } = await sharp(path.join(root, 'img/duck-hunt-ducks.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const background = [...data.subarray(0, 3)];
  for (let i = 0; i < data.length; i += 4) {
    if (background.every((value, channel) => data[i + channel] === value)) data[i + 3] = 0;
  }
  const frames = [
    ['fly-1', 107, 1, 37, 37], ['fly-2', 145, 1, 37, 37],
    ['fly-3', 183, 1, 37, 39], ['shot', 222, 10, 36, 32],
    ['fall-1', 264, 9, 22, 33], ['fall-2', 289, 9, 22, 33],
  ];
  for (const [name, left, top, width, height] of frames) {
    const frame = await sharp(data, { raw: info }).extract({ left, top, width, height }).png().toBuffer();
    await sharp({ create: { width: 40, height: 40, channels: 4, background: '#00000000' } })
      .composite([{ input: frame, left: Math.floor((40 - width) / 2), top: Math.floor((40 - height) / 2) }])
      .png().toFile(path.join(root, `img/duck-${name}.png`));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
