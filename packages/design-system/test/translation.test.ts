import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { translate, type Dictionaries } from '../src/localisation/translate';
import { TranslationProvider, useTranslation } from '../src/localisation/TranslationProvider';
import { FrameGallery } from '../src/ui/FrameGallery/FrameGallery';
import { PlaybackToggle } from '../src/ui/PlaybackToggle/PlaybackToggle';
import { ClipFilmstrip } from '../src/ui/ClipFilmstrip/ClipFilmstrip';
import { storyPlayableClip } from '../src/stories/media';
import en from '../src/localisation/en.json' with { type: 'json' };
import de from '../src/localisation/de.json' with { type: 'json' };

function Probe() {
  const locale = useTranslation();
  return createElement('output', {
    'data-language': locale.language,
    'data-dir': locale.dir,
    'data-immutable': Object.isFrozen(locale),
  }, locale.t('report.preview'));
}

describe('dictionary translation', () => {
  it('resolves stable IDs in both languages and keeps their keys in parity', () => {
    expect(translate('report.preview', 'en')).toBe('Preview');
    expect(translate('report.preview', 'de')).toBe('Vorschau');
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('returns the key verbatim for missing messages or languages, including inherited property names', () => {
    expect(translate('missing.{count}', 'en', { count: 2 })).toBe('missing.{count}');
    expect(translate('report.preview', 'fr')).toBe('report.preview');
    expect(translate('report.preview', 'toString')).toBe('report.preview');
    expect(translate('toString', 'en')).toBe('toString');
    expect(translate('report.preview', 'de', {}, { en, de: {} })).toBe('report.preview');
  });

  it('formats named parameters, preserving absent placeholders and supplied zero or empty values', () => {
    const dictionaries = { en: { message: '{label}/{count}/{missing}', empty: '' } };
    expect(translate('message', 'en', { label: '', count: 0 }, dictionaries)).toBe('/0/{missing}');
    expect(translate('empty', 'en', {}, dictionaries)).toBe('');
    expect(translate('media.previewFrame', 'de', { index: 1, total: 3, time: '00:02' }))
      .toBe('Aufgezeichnetes Bild 1 von 3 ansehen, 00:02');
  });

  it.each([
    ['en', 0, '0 events'], ['en', 1, '1 event'], ['en', 2, '2 events'],
    ['de', 0, '0 Ereignisse'], ['de', 1, '1 Ereignis'], ['de', 2, '2 Ereignisse'],
  ] as const)('selects the plural form for %s and %s', (language, count, expected) => {
    expect(translate('report.events', language, { count })).toBe(expected);
  });

  it('leaves a missing count placeholder intact in the other form', () => {
    expect(translate('report.events', 'en')).toBe('{count} events');
  });

  it('isolates the default dictionary from mutation of an imported JSON object', () => {
    const original = en['report.preview'];
    try {
      en['report.preview'] = 'Changed';
      expect(translate('report.preview', 'en')).toBe('Preview');
    } finally { en['report.preview'] = original; }
  });
});

describe('translation scopes', () => {
  it('keeps sibling and nested scopes separate and defaults standalone use to English/LTR', () => {
    const html = renderToStaticMarkup(createElement('div', null,
      createElement(TranslationProvider, { language: 'de', dir: 'rtl', children: createElement('section', null,
        createElement(Probe),
        createElement(TranslationProvider, { language: 'en', children: createElement(Probe) }),
        createElement(Probe),
      ) }),
      createElement(Probe),
    ));
    expect(html.match(/data-language="de" data-dir="rtl" data-immutable="true">Vorschau/g)).toHaveLength(2);
    expect(html.match(/data-language="en" data-dir="ltr" data-immutable="true">Preview/g)).toHaveLength(2);
  });

  it('receives host dictionaries from the provider and renders plain text', () => {
    const dictionaries = { en: { 'report.preview': '<b>Host preview</b>' } };
    const html = renderToStaticMarkup(createElement(TranslationProvider, { language: 'en', dir: 'rtl', dictionaries,
      children: createElement(Probe),
    }));
    expect(html).toContain('data-language="en" data-dir="rtl"');
    expect(html).toContain('&lt;b&gt;Host preview&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('inherits host dictionaries through nested providers and preserves same-language shared messages', () => {
    function Messages() {
      const { t } = useTranslation();
      return createElement('output', null, [t('report.preview'), t('host.title'), t('media.before'), t('missing')].join('/'));
    }
    const dictionaries: Dictionaries = {
      en: { 'report.preview': 'Host preview', 'host.title': 'Host' },
      de: { 'host.title': 'Anwendung' },
    };
    const html = renderToStaticMarkup(createElement('div', null,
      createElement(TranslationProvider, { language: 'en', dictionaries, children: createElement('section', null,
        createElement(Messages),
        createElement(TranslationProvider, { language: 'de', children: createElement(Messages) }),
        createElement(TranslationProvider, { language: 'en', children: createElement(Messages) }),
      ) }),
      createElement(Messages),
    ));
    expect(html.match(/Host preview\/Host\/Before\/missing/g)).toHaveLength(2);
    expect(html).toContain('Vorschau/Anwendung/Vorher/missing');
    expect(html).toContain('Preview/host.title/Before/missing');
  });

  it('localizes reusable media controls through context without wording props', () => {
    const html = renderToStaticMarkup(createElement(TranslationProvider, { language: 'de', children: createElement('div', null,
      createElement(FrameGallery, { frames: [{ id: 'image', label: 'Image', src: 'image.png' }] }),
      createElement(PlaybackToggle, { open: false, controlsId: 'video', onToggle: () => {} }),
      createElement(ClipFilmstrip, { clip: storyPlayableClip, previewEnabled: true }),
    ) }));
    expect(html).toContain('data-action-label="Öffnen"');
    expect(html).toContain('aria-label="Bild „Image“ öffnen"');
    expect(html).toContain('aria-label="Video abspielen"');
    expect(html).toContain('aria-label="Aufgezeichnete Übergangsbilder"');
  });
});
