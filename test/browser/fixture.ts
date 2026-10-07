import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Where the fixture page puts its button, in CSS pixels. */
export const BUTTON = { x: 100, y: 100, width: 200, height: 60 } as const;

/** Where `/still` puts its link to the section at 1800 px, in CSS pixels. */
export const ANCHOR = { x: 100, y: 100, width: 200, height: 60 } as const;

const box = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) =>
  `position: absolute; left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px;`;

/**
 * The page under test. The `requestAnimationFrame` counter keeps the compositor
 * producing frames: a static page stops sending screencast frames once it has
 * painted, and every "next frame after X" rule would then wait forever. The
 * scroll rule doesn't wait for frames (the stream's `quiet` ends a scroll);
 * `STILL` is the page that checks it.
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

/**
 * A tall page that paints once and then stops, as most real pages do: no
 * ticker, so the screencast goes silent between scrolls. Each 600 px section
 * is labelled with where it starts, so a capture shows which offset it is at;
 * a link at the top goes to the one at 1800 px.
 */
const STILL = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>uxr fixture, still</title>
    <style>
      body { margin: 0; font: 32px sans-serif; }
      section { height: 600px; padding: 16px; box-sizing: border-box; }
      section:nth-child(odd) { background: #dde6f5; }
      #to-1800 { ${box(ANCHOR)} }
    </style>
  </head>
  <body>
    <section>0 px</section><section>600 px</section><section>1200 px</section>
    <section id="at-1800">1800 px</section><section>2400 px</section><section>3000 px</section>
    <section>3600 px</section>
    <a id="to-1800" href="#at-1800">To 1800 px</a>
  </body>
</html>`;

/**
 * A tall page whose sections are half as tall as the window is wide, as text
 * reflows: resizing the window moves the content above what is on screen, and
 * Chrome moves the page's offset to keep that in place (scroll anchoring). Their
 * height stays `auto`, as text's does: a change to it would turn that off.
 * No ticker, as `/still`.
 */
const FLUID = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>uxr fixture, fluid</title>
    <style>
      body { margin: 0; font: 32px sans-serif; }
      section { aspect-ratio: 2 / 1; padding: 16px; box-sizing: border-box; }
      section:nth-child(odd) { background: #dde6f5; }
    </style>
  </head>
  <body>
    <section>1</section><section>2</section><section>3</section><section>4</section>
    <section>5</section><section>6</section><section>7</section><section>8</section>
  </body>
</html>`;

const SECOND = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>uxr fixture, second page</title></head>
  <body><p>Second page.</p></body>
</html>`;

/**
 * Where the SPA fixture puts its controls, in CSS pixels. The router links are
 * fixed to the window, so they can be clicked from anywhere down the page.
 */
export const SPA = {
  /** A router link: `pushState('/spa/b')`, then render route B at the top. */
  link: { x: 100, y: 100, width: 200, height: 60 },
  /** Rewrites the query string only: `replaceState('?q=x')`. */
  filter: { x: 100, y: 200, width: 200, height: 60 },
  /**
   * A router link that renders route B at the top first and pushes its URL a
   * moment later, as some frameworks do.
   */
  lateLink: { x: 100, y: 300, width: 200, height: 60 },
} as const;

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
      #to-b { ${box(SPA.link)} position: fixed; display: block; }
      #to-b-late { ${box(SPA.lateLink)} position: fixed; display: block; }
      #filter { ${box(SPA.filter)} }
      #route { position: fixed; left: 8px; bottom: 8px; }
      #tick { position: fixed; right: 8px; bottom: 8px; }
    </style>
  </head>
  <body>
    <a id="to-b" href="/spa/b">To route B</a>
    <a id="to-b-late" href="/spa/b">To route B, URL late</a>
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
      const render = (path = location.pathname) => {
        route.textContent = path + location.search;
        document.body.style.background = path === '/spa/b' ? '#eef' : '#fff';
      };
      // A router shows a new route at the top.
      const showRouteB = () => {
        render('/spa/b');
        scrollTo(0, 0);
      };
      document.getElementById('to-b').addEventListener('click', (event) => {
        event.preventDefault();
        history.pushState(null, '', '/spa/b');
        showRouteB();
      });
      document.getElementById('to-b-late').addEventListener('click', (event) => {
        event.preventDefault();
        showRouteB();
        setTimeout(() => history.pushState(null, '', '/spa/b'), 30);
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
  '/still': STILL,
  '/fluid': FLUID,
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
