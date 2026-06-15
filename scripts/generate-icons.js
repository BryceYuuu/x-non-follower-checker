const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const assetsDir = path.join(root, "assets");
fs.mkdirSync(assetsDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const png = createIcon(size);
  fs.writeFileSync(path.join(assetsDir, `icon${size}.png`), png);
}

console.log("Generated extension icons.");

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 128;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 48 * scale;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        pixels[index] = 22;
        pixels[index + 1] = 24;
        pixels[index + 2] = 28;
        pixels[index + 3] = 255;
      }
    }
  }

  drawLine(pixels, size, 43 * scale, 37 * scale, 85 * scale, 91 * scale, 9 * scale, [255, 255, 255, 255]);
  drawLine(pixels, size, 84 * scale, 37 * scale, 43 * scale, 91 * scale, 9 * scale, [255, 255, 255, 255]);

  const checkCx = 94 * scale;
  const checkCy = 90 * scale;
  const checkRadius = 19 * scale;
  fillCircle(pixels, size, checkCx, checkCy, checkRadius, [28, 155, 240, 255]);
  drawLine(pixels, size, 85 * scale, 90 * scale, 91 * scale, 97 * scale, 5 * scale, [255, 255, 255, 255]);
  drawLine(pixels, size, 91 * scale, 97 * scale, 103 * scale, 82 * scale, 5 * scale, [255, 255, 255, 255]);

  return encodePng(size, size, pixels);
}

function fillCircle(pixels, size, cx, cy, radius, color) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        setPixel(pixels, size, x, y, color);
      }
    }
  }
}

function drawLine(pixels, size, x1, y1, x2, y2, width, color) {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - width));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x1, x2) + width));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - width));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y1, y2) + width));
  const lenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lenSq));
      const nearestX = x1 + t * (x2 - x1);
      const nearestY = y1 + t * (y2 - y1);
      const dist = Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
      if (dist <= width / 2) setPixel(pixels, size, x, y, color);
    }
  }
}

function setPixel(pixels, size, x, y, color) {
  const index = (y * size + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3];
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", Buffer.concat([
      uint32(width),
      uint32(height),
      Buffer.from([8, 6, 0, 0, 0])
    ])),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data])))
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
