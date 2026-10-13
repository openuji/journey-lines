import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyDraft, journeyTemplate, type ReportDraft } from '@openuji/journey';
import { campusDraft, campusEvents } from '@openuji/journey/fixtures';
import { ReportDocument } from '../src/ui/ReportDocument/ReportDocument';

describe('ReportDocument', () => {
  const edit = (draft: ReportDraft) =>
    renderToStaticMarkup(createElement(ReportDocument, { events: campusEvents, draft, onEdit: () => {} }));

  it('offers every template field while editing', () => {
    const html = edit(emptyDraft);
    for (const field of [...journeyTemplate.header, ...journeyTemplate.closing]) {
      expect(html).toContain(`aria-label="${field.label}"`);
    }
    expect(html).toContain('Start phase here');
  });

  it('shows the tags and offers only the suggestions not yet used', () => {
    const html = renderToStaticMarkup(createElement(ReportDocument, {
      events: campusEvents,
      draft: campusDraft,
      tagSuggestions: ['Freie Universität Berlin', 'Wintersemester 2026/27'],
      onEdit: () => {},
    }));
    expect(html).toContain('aria-label="Remove tag Campus orientation"');
    expect(html).toContain('+ Wintersemester 2026/27');
    expect(html).not.toContain('+ Freie Universität Berlin');
  });

  it('keeps every step while editing, hidden ones folded with a way back', () => {
    const html = edit(campusDraft);
    expect(html).toContain('Hidden · Left page');
    expect(html).toContain('>Show<');
    expect(html).toContain('Remove phase');
    expect(html).not.toContain('Phase 3 — ');
  });
});
