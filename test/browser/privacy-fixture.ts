import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PrivacyProfile } from '@journey-lines/privacy';
import { css, locatorId, profile, rule } from '../../packages/privacy/test/fixtures.js';

export const recordingProfile: PrivacyProfile = {
  ...profile([
    css('name', '#identity'), css('username', '#username'), css('password', '#password'), css('title', '#identity'),
  ], [
    rule('name'),
    { id: 'username', locatorRef: locatorId('username'), scopeRefs: ['page'], action: 'mask-input' },
    { id: 'password', locatorRef: locatorId('password'), scopeRefs: ['page'], action: 'mask-input' },
    { id: 'title', locatorRef: locatorId('title'), scopeRefs: ['page'], action: 'replace-attribute', attribute: 'title', replacement: 'Don Joe' },
  ]),
  metadata: [{ id: 'fixture.aliases', scopeRefs: ['page'], fields: ['url', 'title', 'text', 'identifier', 'link'],
    pattern: 'fixture-original', replacement: 'donjoe' }],
};

export const RECORDING_HTML = `<!doctype html><html><head><title>fixture-original</title>
<style>
  body { margin: 0; background: white; font: 18px monospace; }
  #identity { position: fixed; left: 20px; top: 20px; width: 550px; height: 70px; font: bold 38px monospace; color: black; background: white; }
  #fixture-original { position: fixed; left: 20px; top: 120px; width: 200px; height: 50px; }
  form { position: fixed; left: 20px; top: 200px; }
  input { display: block; margin: 10px; }
  #editable-parent { position: fixed; left: 20px; top: 400px; }
  #response { position: fixed; left: 650px; top: 100px; width: 150px; height: 150px; background: #444; }
  #response.changed { animation: change 350ms linear; background: #08f; }
  @keyframes change { from { background: #f00; } to { background: #08f; } }
</style></head><body>
<div id="identity" title="fixture-original">Fixture Original</div>
<button id="fixture-original">Show details</button><div id="response"></div>
<form id="login" action="/submit" method="post"><label>Username<input id="username" name="username" autocomplete="username" type="text"></label>
<label>Password<input id="password" name="password" autocomplete="current-password" type="password"></label><button>Submit</button></form>
<div id="editable-parent">Public label<textarea>private-textarea</textarea><div contenteditable>private-editor</div><span style="display: none">private-hidden</span></div>
<script>
 document.querySelector('#fixture-original').addEventListener('pointerdown', () => document.querySelector('#response').classList.toggle('changed'));
 document.querySelector('#login').addEventListener('submit', async (event) => {
   event.preventDefault();
   const data = new URLSearchParams(new FormData(event.target));
   const response = await fetch('/submit', { method: 'POST', body: data });
   document.body.dataset.submitted = await response.text();
 });
</script></body></html>`;

export async function startRecordingFixture() {
  const submissions: string[] = [];
  const server = createServer((request, response) => {
    if (request.url === '/submit' && request.method === 'POST') {
      let data = '';
      request.setEncoding('utf8');
      request.on('data', (part: string) => { data += part; });
      request.on('end', () => { submissions.push(data); response.writeHead(200); response.end('ok'); });
    } else {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(RECORDING_HTML);
    }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, submissions,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }) };
}
