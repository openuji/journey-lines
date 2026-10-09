import { createServer, type ServerResponse } from 'node:http';
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
 * painted, and a post-click, which waits for the next frame, would then wait
 * forever. The scroll rule and the lifecycle milestones don't wait for frames
 * (the stream's `quiet` stands in for one); `STILL` is the page that checks it.
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

/** Where `/opener` puts its link that opens `/` in a new tab, in CSS pixels. */
export const NEW_TAB_LINK = { x: 100, y: 100, width: 200, height: 60 } as const;

/** A link that opens the fixture page in a new tab; it keeps painting, as `INDEX` does. */
const OPENER = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>uxr opener</title></head>
  <body style="margin: 0">
    <a id="new-tab" href="/" target="_blank" style="${box(NEW_TAB_LINK)}">new tab</a>
    <span id="tick" style="position: absolute; top: 300px">0</span>
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
 * A page about one image that arrives slowly: the network is almost idle
 * (one request open) long before the image is in. It notes when it is.
 */
const SLOW_IMAGE_PAGE = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>uxr slow image</title></head>
  <body style="margin: 0; background: #111">
    <img src="/slow-image.png" width="400" height="300" onload="window.imageLoadedAt = Date.now()" />
  </body>
</html>`;

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Where `/calendar` puts things, in CSS pixels: a button that turns the month
 * on `pointerdown`, before the click — as flatpickr's arrows do — one that
 * turns it on `click`, for the keyboard, and the month, a colour each.
 */
export const CALENDAR = {
  next: { x: 100, y: 100, width: 200, height: 60 },
  keyNext: { x: 100, y: 200, width: 200, height: 60 },
  month: { x: 400, y: 100, width: 300, height: 200 },
  /** Hides itself on `pointerdown`, as a date picker's day closes the picker: the release lands elsewhere. */
  vanish: { x: 100, y: 400, width: 200, height: 60 },
} as const;

/** The month `/calendar` shows, by its colour: month 0 first. */
export const MONTH_COLORS = [
  [220, 40, 40],
  [40, 160, 40],
  [40, 40, 220],
  [220, 160, 0],
  [160, 0, 160],
  [0, 160, 160],
] as const;

/**
 * A still page, no ticker: it paints only when the month turns, then a 300 ms
 * animation brings the new month in. The buttons look the same pressed or not,
 * so a click changes only the month.
 */
const CALENDAR_PAGE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>uxr fixture, calendar</title>
    <style>
      body { margin: 0; font: 16px sans-serif; }
      button, button:hover, button:active, button:focus {
        appearance: none; border: 0; outline: none; background: #ddd; color: #000; font: inherit;
      }
      #next { ${box(CALENDAR.next)} }
      #key-next { ${box(CALENDAR.keyNext)} }
      #month { ${box(CALENDAR.month)} background: rgb(${MONTH_COLORS[0].join(', ')}); }
      #month.turn { animation: turn 300ms ease-out; }
      #vanish { ${box(CALENDAR.vanish)} background: #bbb; }
      #vanish.gone { display: none; }
      @keyframes turn { from { opacity: 0.2; transform: translateY(-20px); } to { opacity: 1; transform: none; } }
    </style>
  </head>
  <body>
    <button id="next">Next</button>
    <button id="key-next">Next (keyboard)</button>
    <div id="month"></div>
    <div id="vanish">Pick</div>
    <script>
      const colors = ${JSON.stringify(MONTH_COLORS)};
      const month = document.getElementById('month');
      let shown = 0;
      const turn = () => {
        shown += 1;
        month.style.background = 'rgb(' + colors[shown % colors.length].join(', ') + ')';
        month.classList.remove('turn');
        void month.offsetWidth;
        month.classList.add('turn');
      };
      document.getElementById('next').addEventListener('pointerdown', turn);
      document.getElementById('key-next').addEventListener('click', turn);
      document.getElementById('vanish').addEventListener('pointerdown', (e) => e.target.remove());
    </script>
  </body>
</html>`;

const PAGES: Readonly<Record<string, string>> = {
  '/calendar': CALENDAR_PAGE,
  '/': INDEX,
  '/second': SECOND,
  '/still': STILL,
  '/fluid': FLUID,
  '/spa': SPA_PAGE,
  '/spa/b': SPA_PAGE,
  '/opener': OPENER,
  '/slow-image': SLOW_IMAGE_PAGE,
};

/**
 * A PDF of `pages` pages, each with a coloured box: Chrome shows it in its
 * PDF viewer, which takes the extension's debugger away when it commits.
 */
function pdf(pages: number): Buffer {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
  const kids: string[] = [];
  const content = '0.2 0.4 0.8 rg 20 20 260 160 re f';
  for (let page = 0; page < pages; page += 1) {
    const id = objects.length + 1;
    kids.push(`${id} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents ${id + 1} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;

  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, i) => {
    const offset = body.length;
    body += `${i + 1} 0 obj ${object} endobj\n`;
    return offset;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

const PDF = pdf(1);
/** Tall enough to scroll in the viewer. */
const SLOW_PDF = pdf(5);
/** A slow file arrives in this many parts, this far apart: about 1.5 s, as over a real network. */
const SLOW_PARTS = 10;
const SLOW_PART_MS = 150;

function trickle(res: ServerResponse, contentType: string, body: Buffer): void {
  res.writeHead(200, { 'content-type': contentType, 'content-length': body.length });
  const size = Math.ceil(body.length / SLOW_PARTS);
  let sent = 0;
  const timer = setInterval(() => {
    res.write(body.subarray(sent, (sent += size)));
    if (sent >= body.length) {
      clearInterval(timer);
      res.end();
    }
  }, SLOW_PART_MS);
  res.on('close', () => clearInterval(timer));
}

export interface FixtureServer {
  /** Absolute URL of a fixture path, e.g. `url('/')`. */
  url(path: string): string;
  close(): Promise<void>;
}

/** Serves the fixture pages on a free loopback port. */
export async function startFixtureServer(): Promise<FixtureServer> {
  const server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    if (path === '/doc.pdf') {
      res.writeHead(200, { 'content-type': 'application/pdf' }).end(PDF);
      return;
    }
    if (path === '/slow.pdf') return trickle(res, 'application/pdf', SLOW_PDF);
    if (path === '/slow-image.png') return trickle(res, 'image/png', PNG);
    // A server that never answers: a new tab on it never commits a page.
    if (path === '/hang') return;

    const page = PAGES[path];
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
