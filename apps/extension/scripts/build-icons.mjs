import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer';

const extensionRoot = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = path.join(extensionRoot, 'assets', 'icons');
const outputRoot = path.join(extensionRoot, 'public', 'icons');
const variants = [
  { name: 'action', sizes: [16, 24, 32, 48, 128] },
  { name: 'action-open', sizes: [16, 24, 32] },
];

await mkdir(outputRoot, { recursive: true });

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const { name, sizes } of variants) {
    await page.goto(pathToFileURL(path.join(sourceRoot, `${name}.svg`)).href);
    for (const size of sizes) {
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      await page.screenshot({
        path: path.join(outputRoot, `${name}-${size}.png`),
        type: 'png',
      });
    }
  }
} finally {
  await browser.close();
}
