import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyDraft, getJourneyTemplate, journeyTemplate, type ReportDraft } from '@journey-lines/journey';
import { campusDraft, campusEvents } from '@journey-lines/journey/fixtures';
import { ReportDocument } from '../src/ui/ReportDocument/ReportDocument';
import { TranslationProvider } from '../src/localisation/TranslationProvider';

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

  it('renders the supplied German template inside a German translation scope', () => {
    const html = renderToStaticMarkup(createElement(TranslationProvider, { language: 'de',
      children: createElement(ReportDocument, {
      events: campusEvents, draft: campusDraft, onEdit: () => {},
      template: getJourneyTemplate('de'),
    }) }));
    expect(html).toContain('aria-label="Titel"');
    expect(html).toContain('aria-label="Mein Ziel"');
    expect(html).toContain('Phase hier beginnen');
    expect(html).toContain('aria-label="Schlagwort Campus orientation entfernen"');
    expect(html).toContain('data-action-label="Öffnen"');
    expect(html).toContain('aria-label="Bild „Seite geladen“ öffnen"');
  });
});
