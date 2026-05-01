import { copyFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "dist");

await rm(outDir, { force: true, recursive: true });
await mkdir(outDir, { recursive: true });

await copyFile(resolve(root, "public/manifest.json"), resolve(outDir, "manifest.json"));

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
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(root, "src/content/index.tsx"),
      formats: ["iife"],
      name: "AgentationContent",
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
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(root, "src/background/index.ts"),
      formats: ["iife"],
      name: "AgentationBackground",
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
