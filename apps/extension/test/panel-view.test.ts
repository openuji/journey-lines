import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelView } from '../src/ui/PanelView/PanelView';
import { ExtensionTranslationProvider as TranslationProvider } from '../src/localisation/TranslationProvider';
import { donePanelState, idlePanelState, interruptedRecorderStatus, recordingPanelState } from '../src/stories/panel-states';
import { dictionaries } from '../src/localisation/dictionaries';

describe('event-based panel', () => {
  const actions = { onRecord: () => {}, onStop: () => {}, onReset: () => {}, onOpenReport: () => {}, onDismissError: () => {} };
  const renderPanel = (state: typeof recordingPanelState) => renderToStaticMarkup(createElement(TranslationProvider, {
    language: 'en', children: createElement(PanelView, { state, ...actions }),
  }));

  it('keeps extension dictionary keys in parity', () => {
    expect(Object.keys(dictionaries.de).sort()).toEqual(Object.keys(dictionaries.en).sort());
  });

  it.each([
    ['en', 'Stop', 'Open report', 'Page loaded', 'Before', 'After', 'Duration'],
    ['de', 'Stoppen', 'Bericht öffnen', 'Seite geladen', 'Vorher', 'Nachher', 'Dauer'],
  ] as const)('uses one %s scope for recorder controls, timeline events, and media', (language, stop, open, page, before, after, duration) => {
    const render = (state: typeof recordingPanelState) => renderToStaticMarkup(createElement(TranslationProvider, { language,
      children: createElement(PanelView, { state, ...actions }),
    }));
    const recording = render(recordingPanelState);
    const done = render(donePanelState);
    expect(recording).toContain('>' + stop + '</button>');
    expect(done).toContain('>' + open + '</button>');
    expect(done).toContain('<dt>' + duration + '</dt>');
    for (const html of [recording, done]) {
      expect(html).toContain(page);
      expect(html).toContain(before);
      expect(html).toContain(after);
      expect(html).toContain(language === 'de' ? 'Bild „Vorher“ öffnen' : 'Expand before frame');
    }
  });

  it('translates idle, loading, interruption, and dismissal messages while preserving diagnostic details', () => {
    const render = (state: typeof recordingPanelState) => renderToStaticMarkup(createElement(TranslationProvider, { language: 'de',
      children: createElement(PanelView, { state, ...actions }),
    }));
    expect(render(idlePanelState)).toContain('Aufnehmen');
    expect(render({ ...idlePanelState, connected: false })).toContain('Verbindung zur Aufzeichnung');
    expect(render({ ...recordingPanelState, captures: [] })).toContain('Warten auf das erste Bild');
    expect(render({ ...donePanelState, status: interruptedRecorderStatus })).toContain('weil ihr Fenster geschlossen wurde');
    const error = render({ ...idlePanelState, error: 'Chrome diagnostic: example.test' });
    expect(error).toContain('aria-label="Schließen"');
    expect(error).toContain('Chrome diagnostic: example.test');
  });

  it.each([recordingPanelState, donePanelState])('renders one message per event with generic interaction labels', (state) => {
    const html = renderPanel(state);
    expect(html.match(/data-tone="(page|click|scroll|exit)"/g)).toHaveLength(6);
    expect(html).toContain('Page loaded');
    expect(html).toContain('Page changed');
    expect(html.match(/>Click<\/span>/g)).toHaveLength(2);
    expect(html).toContain('Before');
    expect(html).toContain('After');
    expect(html).not.toContain('pre-click');
    expect(html).not.toContain('post-scroll');
    expect(html).not.toContain('00-first');
    expect(html).not.toContain('compositor');
    expect(html).not.toContain('view-row');
  });

  it('counts the displayed events and views in the completed summary', () => {
    const html = renderPanel(donePanelState);
    expect(html).toContain('<dt>Events</dt><dd>6</dd>');
    expect(html).toContain('<dt>Views</dt><dd>2</dd>');
    expect(html).not.toContain('<dt>Captures</dt>');
  });

  it('shows the report action in the completed panel fixture', () => {
    const html = renderPanel(donePanelState);
    expect(html).toContain('Open report');
  });
});
