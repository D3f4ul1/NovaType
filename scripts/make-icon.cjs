/**
 * Builds `build/icon.ico` from the app's own SVG mark.
 *
 * Run with `npx electron scripts/make-icon.cjs`. It is a one-off build step rather than part
 * of `npm run build`, because the icon changes about once a year and it costs an Electron
 * launch.
 *
 * Why Electron rasterises it rather than a Node library: the mark is an SVG, and the only
 * renderer guaranteed to be on this machine is the one the app already ships with. Each size
 * is drawn at that size and then captured, rather than one bitmap being downscaled, which is
 * the difference between a readable icon in the taskbar and a smear.
 *
 * The page is written to a file and loaded with `loadFile` rather than being passed as a
 * `data:` URL: Chromium refuses the second consecutive top-level `data:` navigation, which is
 * exactly what looping over the sizes does.
 *
 * The ICO is written as BMP entries rather than PNG ones. PNG-compressed entries are legal
 * and smaller, but they are a Vista-and-later extension that older icon readers mishandle. At
 * these sizes the BMP form costs a few kilobytes.
 *
 * `public/favicon.svg` is the source, so the tab icon and the desktop icon cannot drift
 * apart. The tile is drawn full-bleed and fully opaque on purpose: with no alpha there is
 * nothing for a premultiplied bitmap to get wrong.
 */

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SVG_SOURCE = path.join(ROOT, 'public', 'favicon.svg')
const OUT_DIR = path.join(ROOT, 'build')
const OUT_FILE = path.join(OUT_DIR, 'icon.ico')
const PAGE_FILE = path.join(OUT_DIR, 'icon-page.html')

const SIZES = [16, 24, 32, 48, 64, 128, 256]

/** The tile behind the mark, in the app's own base colours. */
const TILE_BACKGROUND = 'linear-gradient(160deg, #16203a 0%, #0a1020 55%, #070b14 100%)'

// Captures must be exactly `size` pixels; a scaled display would otherwise hand back 1.25×.
app.commandLine.appendSwitch('force-device-scale-factor', '1')

function pageHtml(svg) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
      body {
        background: ${TILE_BACKGROUND};
        display: flex;
        align-items: center;
        justify-content: center;
      }
      /*
        The mark's ink does not fill its own viewBox: it spans 83% of the width and 78% of
        the height, sitting right of centre and low, because the arcs reach the top-right
        corner and the nib reaches the bottom-left. So the SVG is drawn at 95% of the tile
        *and* nudged, which lands the ink evenly with a small margin — measured against a
        capture, not guessed.
      */
      svg { width: 95%; height: 95%; display: block; transform: translate(-4%, -3%); }
    </style>
  </head>
  <body>${svg}</body>
</html>
`
}

/** A 32bpp BMP entry: a 40-byte DIB header, bottom-up BGRA rows, then an empty AND mask. */
function bmpEntry(size, bgra) {
  const maskStride = Math.ceil(size / 32) * 4
  const maskBytes = maskStride * size
  const pixelBytes = size * size * 4

  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0) // header size
  header.writeInt32LE(size, 4) // width
  header.writeInt32LE(size * 2, 8) // height: the XOR bitmap and the AND mask
  header.writeUInt16LE(1, 12) // planes
  header.writeUInt16LE(32, 14) // bits per pixel
  header.writeUInt32LE(0, 16) // BI_RGB, no compression
  header.writeUInt32LE(pixelBytes + maskBytes, 20) // image size
  header.writeInt32LE(0, 24) // x pixels per metre
  header.writeInt32LE(0, 28) // y pixels per metre

  // BMP rows run bottom-up; Electron hands them back top-down.
  const pixels = Buffer.alloc(pixelBytes)
  for (let y = 0; y < size; y++) {
    const from = (size - 1 - y) * size * 4
    bgra.copy(pixels, y * size * 4, from, from + size * 4)
  }

  // All-zero mask: every pixel is opaque by the alpha channel, which is what the mask means.
  const mask = Buffer.alloc(maskBytes)
  return Buffer.concat([header, pixels, mask])
}

function icoFile(entries) {
  const dir = Buffer.alloc(6 + entries.length * 16)
  dir.writeUInt16LE(0, 0) // reserved
  dir.writeUInt16LE(1, 2) // type: icon
  dir.writeUInt16LE(entries.length, 4)

  let offset = dir.length
  entries.forEach((entry, index) => {
    const at = 6 + index * 16
    // 0 means 256 in this field, the only size that does not fit in a byte.
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, at)
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, at + 1)
    dir.writeUInt8(0, at + 2) // palette size
    dir.writeUInt8(0, at + 3) // reserved
    dir.writeUInt16LE(1, at + 4) // planes
    dir.writeUInt16LE(32, at + 6) // bits per pixel
    dir.writeUInt32LE(entry.data.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += entry.data.length
  })

  return Buffer.concat([dir, ...entries.map((entry) => entry.data)])
}

/** True when every pixel is identical, i.e. the page has not painted the mark yet. */
function isBlank(bitmap) {
  const first = bitmap.readUInt32LE(0)
  for (let at = 4; at < bitmap.length; at += 4) {
    if (bitmap.readUInt32LE(at) !== first) return false
  }
  return true
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Captures one size. The window is resized rather than recreated — a second window racing the
 * first one's teardown is what made the original version fail on its second size — and the
 * capture is retried, because a resize and the repaint that follows it are not synchronised
 * with anything the main process can await.
 */
async function capture(win, size) {
  win.setContentSize(size, size)

  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(attempt === 0 ? 160 : 220)
    const image = await win.webContents.capturePage()
    const resize =
      image.getSize().width === size ? image : image.resize({ width: size, height: size, quality: 'best' })
    const bitmap = resize.toBitmap()
    if (bitmap.length !== size * size * 4) continue
    if (isBlank(bitmap)) continue
    return bitmap
  }

  throw new Error(`the ${size}px capture never painted`)
}

async function main() {
  const svg = fs.readFileSync(SVG_SOURCE, 'utf8')
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(PAGE_FILE, pageHtml(svg))

  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    frame: false,
    resizable: false,
    useContentSize: true,
    backgroundColor: '#0a1020',
    webPreferences: { sandbox: true },
  })
  await win.loadFile(PAGE_FILE)

  const entries = []
  for (const size of SIZES) {
    const bitmap = await capture(win, size)
    const entry = { size, data: bmpEntry(size, bitmap) }
    entries.push(entry)
    console.log(`  ${String(size).padStart(3)}px  ${entry.data.length} bytes`)
  }
  win.destroy()

  fs.writeFileSync(OUT_FILE, icoFile(entries))
  fs.rmSync(PAGE_FILE, { force: true })
  console.log(`wrote ${path.relative(ROOT, OUT_FILE)} (${fs.statSync(OUT_FILE).size} bytes)`)
  app.exit(0)
}

app
  .whenReady()
  .then(main)
  .catch((error) => {
    console.error('icon build failed:', error && error.message)
    app.exit(1)
  })
