import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelView } from '../src/ui/PanelView/PanelView';
import { donePanelState, recordingPanelState } from '../src/stories/panel-states';

describe('event-based panel', () => {
  const actions = { onRecord: () => {}, onStop: () => {}, onReset: () => {}, onOpenReport: () => {}, onDismissError: () => {} };

  it.each([recordingPanelState, donePanelState])('renders one message per event with generic interaction labels', (state) => {
    const html = renderToStaticMarkup(createElement(PanelView, { state, ...actions }));
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
    const html = renderToStaticMarkup(createElement(PanelView, { state: donePanelState, ...actions }));
    expect(html).toContain('<dt>Events</dt><dd>6</dd>');
    expect(html).toContain('<dt>Views</dt><dd>2</dd>');
    expect(html).not.toContain('<dt>Captures</dt>');
  });

  it('shows the report action in the completed panel fixture', () => {
    const html = renderToStaticMarkup(createElement(PanelView, { state: donePanelState, ...actions }));
    expect(html).toContain('Open report');
  });
});
