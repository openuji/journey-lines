import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Globe } from 'lucide-react';
import { formatClock, journeyEntry, shortUrl } from '@openuji/journey';
import { campusReport, untitledReport } from '@openuji/journey/fixtures';
import { storyMedia } from '../src/stories/media';
import { readerSections } from '../src/ui/ReaderDocument/reader-sections';
import { readerSlides } from '../src/ui/ReaderDocument/reader-slides';
import { StepViewer } from '../src/ui/StepViewer/StepViewer';
import { defaultView, slideViews, viewFrame, type ViewerAt, type ViewerSlide } from '../src/ui/StepViewer/step-viewer';

const entry = journeyEntry(campusReport);
const slides = readerSlides(entry, readerSections(entry), storyMedia(campusReport));

const page: ViewerSlide = {
  key: 'page:1',
  title: 'Page loaded',
  icon: Globe,
  note: '',
  time: '00:00',
  url: 'https://www.fu-berlin.de/vv',
  frames: [{ id: 'frame', label: 'Page loaded', src: 'page.png' }],
};
const scroll: ViewerSlide = {
  ...page,
  key: 'scroll:1:01',
  title: 'Scroll',
  frames: [{ id: 'before', label: 'Before', src: 'before.png' }, { id: 'after', label: 'After', src: 'after.png' }],
};
const click: ViewerSlide = { ...scroll, key: 'click:1:01', title: 'Click', clip: { src: 'click.webm', trace: [{ frameIndex: 0, atMs: 0 }, { frameIndex: 1, atMs: 1_270 }] } };

const render = (at: ViewerAt | null, shown: readonly ViewerSlide[] = slides) =>
  renderToStaticMarkup(createElement(StepViewer, { id: 'viewer', slides: shown, at, onChange: () => {} }));
const button = (html: string, label: string) => new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0] ?? '';

describe('reader slides', () => {
  it('hold every shown step in reading order, with its phase, time, and full address', () => {
    expect(slides.map((slide) => slide.key)).toEqual(entry.steps.map((step) => step.event.key));
    const [first] = slides;
    const phase = entry.phases[0]!;
    expect(first?.phase).toEqual({
      number: 1,
      name: 'Phase',
      title: 'I find an address',
      facts: expect.stringMatching(/^\d\d:\d\d · fu-berlin\.de · \d+ steps$/),
      statements: [
        { label: 'What happens?', text: phase.happened },
        { label: 'The problem', text: phase.problem, tone: 'problem' },
      ],
    });
    expect(first?.time).toBe(formatClock(entry.steps[0]!.event.atMs));
    expect(first?.url).toBe(entry.steps[0]!.event.url);
  });

  it('leave steps before any phase without one', () => {
    const lead = journeyEntry(untitledReport);
    expect(readerSlides(lead, readerSections(lead), storyMedia(untitledReport)).every((slide) => slide.phase === undefined)).toBe(true);
  });
});

describe('viewer views', () => {
  it('show a page as its frame, and an interaction as before, its clip when it has one, and after', () => {
    expect(slideViews(page)).toEqual(['frame']);
    expect(slideViews(click)).toEqual(['before', 'video', 'after']);
    expect(slideViews(scroll)).toEqual(['before', 'after']);
  });

  it('open an interaction on its clip, else on before', () => {
    expect(defaultView(page)).toBe('frame');
    expect(defaultView(click)).toBe('video');
    expect(defaultView(scroll)).toBe('before');
    expect(viewFrame(click, 'after')?.src).toBe('after.png');
    expect(viewFrame(click, 'video')).toBeUndefined();
  });
});

describe('StepViewer', () => {
  it('explains the open step: its phase and what was written about it beside, the step, when and where, and its note under its picture', () => {
    const index = slides.findIndex((slide) => slide.note !== '');
    const slide = slides[index]!;
    const html = render({ index, view: 'before' });
    expect(html).toContain(`Step ${index + 1} of ${slides.length}`);
    expect(html).toContain(`Phase </span>${slide.phase!.number}</span>`);
    expect(html).toContain(slide.phase!.title);
    expect(html).toContain(slide.phase!.facts);
    for (const statement of slide.phase!.statements) {
      expect(html).toContain(statement.label);
      expect(html).toContain(statement.text);
    }
    expect(html).toContain(slide.note);
    expect(html).toContain(`<time>${slide.time}</time>`);
    expect(html).toContain(`title="${slide.url}">${shortUrl(slide.url)}</span>`);
    expect(html).toContain(`src="${slide.frames[0]!.src}"`);
    expect(html.indexOf(slide.note)).toBeGreaterThan(html.indexOf(`src="${slide.frames[0]!.src}"`));
  });

  it('tells a step before any phase without a phase', () => {
    const lead = journeyEntry(untitledReport);
    const leadSlides = readerSlides(lead, readerSections(lead), storyMedia(untitledReport));
    const html = render({ index: 0, view: defaultView(leadSlides[0]!) }, leadSlides);
    expect(html).not.toContain('Phase </span>');
    expect(html).toContain(leadSlides[0]!.title);
  });

  it('cannot go back from the first step, nor on from the last', () => {
    const first = render({ index: 0, view: 'frame' }, [page, click]);
    expect(button(first, 'Previous step')).toContain('disabled');
    expect(button(first, 'Next step')).not.toContain('disabled');
    const last = render({ index: 1, view: 'video' }, [page, click]);
    expect(button(last, 'Next step')).toContain('disabled');
  });

  it('plays a clip with its controls, the clip’s view pressed among before and after', () => {
    const html = render({ index: 1, view: 'video' }, [page, click]);
    expect(html).toMatch(/<video[^>]*src="click\.webm"[^>]*controls/);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>.*Video 1\.27 s<\/button>/);
    expect(html).toContain('>Before</button>');
    expect(html).toContain('>After</button>');
  });

  it('says when a picture is missing, and shows nothing while closed', () => {
    expect(render({ index: 0, view: 'frame' }, [{ ...page, frames: [{ id: 'frame', label: 'Page loaded' }] }])).toContain('Frame unavailable');
    expect(render(null)).not.toContain('<img');
  });
});
