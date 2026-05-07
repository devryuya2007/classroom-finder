import { rm, mkdir, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const projectRoot = resolve(process.cwd());
const distDir = resolve(projectRoot, "dist");
const contentEntry = resolve(projectRoot, "src/content.entry.js");
const contentOutfile = resolve(distDir, "src/content.js");

const targets = [
  { from: "manifest.json", to: "manifest.json" },
  { from: "assets", to: "assets" },
  { from: "src", to: "src" },
];

async function cleanDist() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
}

async function copyTargets() {
  for (const target of targets) {
    await cp(
      resolve(projectRoot, target.from),
      resolve(distDir, target.to),
      { recursive: true }
    );
  }
}

async function bundleContentScript() {
  await build({
    entryPoints: [contentEntry],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2019",
    outfile: contentOutfile,
    minify: false,
  });
}

async function main() {
  await cleanDist();
  await bundleContentScript();
  await copyTargets();
  console.log("Build complete: dist/");
}

main().catch((error) => {
  console.error("Build failed:", error);
  process.exitCode = 1;
});
