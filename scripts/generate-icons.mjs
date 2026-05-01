import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const svgPath = resolve(root, "public/icon.svg");
const outDir = resolve(root, "public/icons");

const sizes = [16, 32, 48, 128];

await mkdir(outDir, { recursive: true });
const svg = await readFile(svgPath);

await Promise.all(
  sizes.map(async (size) => {
    const buffer = await sharp(svg, { density: Math.max(72, size * 4) })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(resolve(outDir, `icon-${size}.png`), buffer);
    console.log(`  ✓ icon-${size}.png`);
  })
);

console.log(`Generated ${sizes.length} icons in public/icons/`);
