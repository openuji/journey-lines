import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyDraft, journeyTemplate, type ReportDraft } from '@openuji/journey';
import { campusDraft, campusEvents } from '@openuji/journey/fixtures';
import { ReportDocument } from '../src/ui/ReportDocument/ReportDocument';

describe('ReportDocument', () => {
  const edit = (draft: ReportDraft) =>
    renderToStaticMarkup(createElement(ReportDocument, { events: campusEvents, draft, onEdit: () => {} }));
  const read = (draft: ReportDraft) =>
    renderToStaticMarkup(createElement(ReportDocument, { events: campusEvents, draft }));

  it('offers every template field while editing', () => {
    const html = edit(emptyDraft);
    for (const field of [...journeyTemplate.header, ...journeyTemplate.closing]) {
      expect(html).toContain(`aria-label="${field.label}"`);
    }
    expect(html).toContain('Start phase here');
  });

  it('shows only what was written when nobody edits it', () => {
    const empty = read(emptyDraft);
    expect(empty).not.toContain('<textarea');
    expect(empty).not.toContain(journeyTemplate.closing[0]!.label);
    expect(empty).not.toContain('Start phase here');

    const filled = read(campusDraft);
    expect(filled).toContain('<h1');
    expect(filled).toContain('Phase 3 — I try to orient myself with Maps');
    expect(filled).toContain('Key insight');
    expect(filled).not.toContain('Hidden ·');
  });
});
