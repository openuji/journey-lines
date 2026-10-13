import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { campusReport, untitledReport } from '@openuji/journey/fixtures';
import { ReportReader } from '../src/ui/ReportReader/ReportReader';

const render = (props: Parameters<typeof ReportReader>[0]) => renderToStaticMarkup(createElement(ReportReader, props));

describe('ReportReader', () => {
  it('shows the report as written, with nothing to edit or save', () => {
    const html = render({ report: campusReport, back: { href: '/', label: 'Journeys' } });
    expect(html).toContain('Where is my lecture hall, actually?');
    expect(html).toContain('Phase 3 — I try to orient myself with Maps');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('Hidden ·');
    expect(html).not.toContain('Download .zip');
    expect(html).not.toContain('>Edit<');
  });

  it('shows only the steps of a report nobody wrote', () => {
    const html = render({ report: untitledReport });
    expect(html).not.toContain('<h1');
    expect(html.match(/data-event-title/g)).toHaveLength(6);
  });

  it('renders loading and unavailable reports', () => {
    expect(render({ report: null })).toContain('Loading report');
    expect(render({ report: null, error: 'Unreadable.' })).toContain('Unreadable.');
  });
});
