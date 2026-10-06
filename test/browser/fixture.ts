import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Where the fixture page puts its button, in CSS pixels. */
export const BUTTON = { x: 100, y: 100, width: 200, height: 60 } as const;

/**
 * The page under test. The `requestAnimationFrame` counter keeps the compositor
 * producing frames: a static page stops sending screencast frames once it has
 * painted, and every "next frame after X" rule would then wait forever.
 */
const INDEX = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>uxr fixture</title>
    <style>
      body { margin: 0; height: 4000px; font: 16px sans-serif; }
      #go {
        position: absolute;
        left: ${BUTTON.x}px; top: ${BUTTON.y}px;
        width: ${BUTTON.width}px; height: ${BUTTON.height}px;
      }
      #tick { position: fixed; right: 8px; bottom: 8px; }
    </style>
  </head>
  <body>
    <button id="go">Go</button>
    <span id="tick">0</span>
    <script>
      const tick = document.getElementById('tick');
      let n = 0;
      const loop = () => {
        tick.textContent = String(++n);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    </script>
  </body>
</html>`;

const SECOND = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>uxr fixture, second page</title></head>
  <body><p>Second page.</p></body>
</html>`;

/** Where the SPA fixture puts its controls, in CSS pixels. */
export const SPA = {
  /** A router link: `pushState('/spa/b')`, then re-render. */
  link: { x: 100, y: 100, width: 200, height: 60 },
  /** Rewrites the query string only: `replaceState('?q=x')`. */
  filter: { x: 100, y: 200, width: 200, height: 60 },
} as const;

const box = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) =>
  `position: absolute; left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px;`;

/**
 * A single-page app: one document, routes switched by the History API.
 * Served at `/spa` and `/spa/b`, the way an SPA server answers every route
 * with the same shell.
 */
const SPA_PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>uxr fixture, spa</title>
    <style>
      body { margin: 0; height: 4000px; font: 16px sans-serif; }
      #to-b { ${box(SPA.link)} display: block; }
      #filter { ${box(SPA.filter)} }
      #route { position: fixed; left: 8px; bottom: 8px; }
      #tick { position: fixed; right: 8px; bottom: 8px; }
    </style>
  </head>
  <body>
    <a id="to-b" href="/spa/b">To route B</a>
    <button id="filter">Filter</button>
    <span id="route"></span>
    <span id="tick">0</span>
    <script>
      const tick = document.getElementById('tick');
      let n = 0;
      const loop = () => {
        tick.textContent = String(++n);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);

      const route = document.getElementById('route');
      const render = () => {
        route.textContent = location.pathname + location.search;
        document.body.style.background =
          location.pathname === '/spa/b' ? '#eef' : '#fff';
      };
      document.getElementById('to-b').addEventListener('click', (event) => {
        event.preventDefault();
        history.pushState(null, '', '/spa/b');
        render();
      });
      document.getElementById('filter').addEventListener('click', () => {
        history.replaceState(null, '', location.pathname + '?q=x');
        render();
      });
      render();
    </script>
  </body>
</html>`;

const PAGES: Readonly<Record<string, string>> = {
  '/': INDEX,
  '/second': SECOND,
  '/spa': SPA_PAGE,
  '/spa/b': SPA_PAGE,
};

export interface FixtureServer {
  /** Absolute URL of a fixture path, e.g. `url('/')`. */
  url(path: string): string;
  close(): Promise<void>;
}

/** Serves the fixture pages on a free loopback port. */
export async function startFixtureServer(): Promise<FixtureServer> {
  const server = createServer((req, res) => {
    const page = PAGES[(req.url ?? '').split('?')[0] ?? ''];
    if (page === undefined) {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(page);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
