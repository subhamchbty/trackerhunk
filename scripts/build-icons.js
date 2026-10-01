// Render assets/logo.svg to PNG icons and pack a Windows .ico from them.
// Run with:  npm run icons
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'assets', 'logo.svg');
const OUT = path.join(ROOT, 'assets', 'icons');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

app.disableHardwareAcceleration();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One offscreen window that renders the SVG; resized for each icon size. */
async function openRenderer(svg) {
  const page = path.join(OUT, '_render.html');
  fs.writeFileSync(
    page,
    `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:transparent;overflow:hidden}
      svg{display:block}
    </style></head><body>${svg}</body></html>`
  );
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true }
  });
  await win.loadFile(page);
  return {
    async render(size) {
      win.setContentSize(size, size);
      await win.webContents.executeJavaScript(
        `document.querySelector('svg').setAttribute('width', ${size}); document.querySelector('svg').setAttribute('height', ${size});`
      );
      await wait(200);
      const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
      return image.resize({ width: size, height: size }).toPNG();
    },
    close() {
      win.destroy();
      fs.unlinkSync(page);
    }
  };
}

/** Pack PNG images into a .ico (PNG-in-ICO is supported since Windows Vista). */
function packIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // colours in palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  try {
    const svg = fs.readFileSync(SVG, 'utf8');
    fs.mkdirSync(OUT, { recursive: true });
    const renderer = await openRenderer(svg);
    const pngs = [];
    for (const size of SIZES) {
      const data = await renderer.render(size);
      fs.writeFileSync(path.join(OUT, `icon-${size}.png`), data);
      pngs.push({ size, data });
    }
    renderer.close();
    fs.copyFileSync(path.join(OUT, 'icon-256.png'), path.join(OUT, 'icon.png'));
    fs.writeFileSync(path.join(OUT, 'icon.ico'), packIco(pngs));
    console.log(`Wrote ${SIZES.length} PNGs and icon.ico to ${OUT}`);
    app.exit(0);
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
