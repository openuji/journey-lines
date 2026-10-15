import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { privacyProfileFromDocument } from '@journey-lines/privacy';

export function loadPrivacyDemoProfile() {
  const document = JSON.parse(readFileSync(new URL('../privacy/demo.jsonld', import.meta.url), 'utf8'));
  return privacyProfileFromDocument(document);
}

export const PRIVACY_DEMO_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Privacy injection demo</title>
<style>body { max-width: 48rem; margin: 4rem auto; font: 18px/1.5 system-ui; padding: 0 1rem; }</style></head>
<body><h1>Privacy injection demo</h1>
<p id="identity">Example Participant</p>
<p>The bundled profile selects which elements to replace on this page.</p>
<p>The terminal reports how many elements matched and were overwritten.</p>
<a href="/second">Open another document</a></body></html>`;

export async function startPrivacyDemo(): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(PRIVACY_DEMO_HTML);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
