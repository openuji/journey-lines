import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  campusDraft,
  campusRecording,
  storyEmptyReport,
  storyReportWithClip,
} from '@openuji/journey/fixtures';
import { ReportView } from '../src/ui/ReportView/ReportView';

describe('ReportView', () => {
  it('renders the recording as an editable report without Chrome APIs', () => {
    const html = renderToStaticMarkup(createElement(ReportView, { session: storyReportWithClip, onDownload: () => {} }));
    expect(html).toContain('Journey Lines research workspace');
    expect(html).toContain('6 events');
    expect(html).toContain('aria-label="Title"');
    expect(html).toContain('Start phase here');
    expect(html.match(/data-event-title/g)).toHaveLength(6);
    expect(html).toContain('Preview');
    expect(html).toContain('Download .zip');
  });

  it('starts from a given draft', () => {
    const html = renderToStaticMarkup(createElement(ReportView, { session: campusRecording, initialDraft: campusDraft }));
    expect(html).toContain('Where is my lecture hall, actually?');
    expect(html).toContain('Hidden · Left page');
  });

  it('renders loading, unavailable, and empty recordings', () => {
    expect(renderToStaticMarkup(createElement(ReportView, { session: null }))).toContain('Loading report');
    expect(renderToStaticMarkup(createElement(ReportView, { session: null, error: 'Recording unavailable.' })))
      .toContain('Recording unavailable.');
    expect(renderToStaticMarkup(createElement(ReportView, { session: storyEmptyReport, onDownload: () => {} })))
      .toContain('No steps were recorded.');
  });
});
