import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "dist");

await rm(outDir, { force: true, recursive: true });
await mkdir(outDir, { recursive: true });

await copyFile(resolve(root, "public/manifest.json"), resolve(outDir, "manifest.json"));
await copyFile(resolve(root, "public/icon.svg"), resolve(outDir, "icon.svg"));

const iconsSrc = resolve(root, "public/icons");
const iconsOut = resolve(outDir, "icons");
await mkdir(iconsOut, { recursive: true });
for (const file of await readdir(iconsSrc)) {
  await copyFile(resolve(iconsSrc, file), resolve(iconsOut, file));
}

await build({
  root: resolve(root, "src/popup"),
  plugins: [react()],
  build: {
    emptyOutDir: false,
    outDir,
    rollupOptions: {
      input: resolve(root, "src/popup/popup.html"),
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});

await build({
  root,
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "({})"
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(root, "src/content/index.tsx"),
      formats: ["iife"],
      name: "ChromentationContent",
      fileName: () => "content.js"
    },
    outDir,
    rollupOptions: {
      output: {
        extend: true
      }
    }
  }
});

await build({
  root,
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "({})"
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(root, "src/background/index.ts"),
      formats: ["iife"],
      name: "ChromentationBackground",
      fileName: () => "background.js"
    },
    outDir,
    rollupOptions: {
      output: {
        extend: true
      }
    }
  }
});
