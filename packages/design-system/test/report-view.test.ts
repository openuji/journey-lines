import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  campusDraft,
  campusRecording,
  storyEmptyReport,
  storyReportWithClip,
} from '@journey-lines/journey/fixtures';
import { ReportView } from '../src/ui/ReportView/ReportView';
import { TranslationProvider } from '../src/localisation/TranslationProvider';

describe('ReportView', () => {
  it('inherits host catalogs through its report scope while retaining shared German messages', () => {
    const html = renderToStaticMarkup(createElement(TranslationProvider, {
      language: 'de', dictionaries: { de: { 'report.preview': 'Host Vorschau' } },
      children: createElement(ReportView, { session: storyReportWithClip, locale: { language: 'de', dir: 'ltr' } }),
    }));
    expect(html).toContain('Host Vorschau');
    expect(html).toContain('6 Ereignisse');
    expect(html).toContain('aria-label="Titel"');
  });

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

  it('uses the same German locale for the report frame and editor', () => {
    const html = renderToStaticMarkup(createElement(ReportView, {
      session: storyReportWithClip, onDownload: () => {}, locale: { language: 'de', dir: 'ltr' },
    }));
    expect(html).toContain('lang="de" dir="ltr"');
    expect(html).toContain('6 Ereignisse');
    expect(html).toContain('aria-label="Titel"');
    expect(html).toContain('Vorschau');
    expect(html).toContain('.zip herunterladen');
  });
});
