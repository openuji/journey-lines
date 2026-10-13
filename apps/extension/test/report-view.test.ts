import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportView } from '../src/ui/ReportView/ReportView';
import { PanelView } from '../src/ui/PanelView/PanelView';
import { donePanelState } from '../src/stories/panel-states';
import { storyEmptyReport, storyReportWithClip } from '../src/stories/report-sessions';

describe('ReportView', () => {
  it('renders captures, view breaks, and a clip without Chrome APIs', () => {
    const html = renderToStaticMarkup(createElement(ReportView, { session: storyReportWithClip, onDownload: () => {} }));
    expect(html).toContain('Journey Lines research workspace');
    expect(html).toContain('journey-lines.example/research/current?team=fu');
    expect(html).toContain('journey-lines.example/research/findings');
    expect(html.match(/aria-label="Open full-size frame for /g)).toHaveLength(9);
    expect(html).toContain('Scroll clip');
    expect(html).toContain('Download .zip');
  });

  it('renders loading, unavailable, and empty recordings', () => {
    expect(renderToStaticMarkup(createElement(ReportView, { session: null }))).toContain('Loading report');
    expect(renderToStaticMarkup(createElement(ReportView, { session: null, error: 'Recording unavailable.' })))
      .toContain('Recording unavailable.');
    expect(renderToStaticMarkup(createElement(ReportView, { session: storyEmptyReport, onDownload: () => {} })))
      .toContain('No captures were recorded.');
  });

  it('shows the report action in the completed panel fixture', () => {
    const html = renderToStaticMarkup(createElement(PanelView, {
      state: donePanelState,
      onRecord: () => {},
      onStop: () => {},
      onReset: () => {},
      onOpenReport: () => {},
      onDismissError: () => {},
    }));
    expect(html).toContain('Open report');
  });
});
