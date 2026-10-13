import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { campusEntry, longTextEntry, storyEntries, untitledEntry } from '@openuji/journey/fixtures';
import { JourneyList } from '../src/ui/JourneyList/JourneyList';

const render = (journeys: Parameters<typeof JourneyList>[0]['journeys']) =>
  renderToStaticMarkup(createElement(JourneyList, { journeys, href: (id: string) => `/journeys/${id}/` }));

describe('JourneyList', () => {
  it('links each journey to its report by title, in the order given', () => {
    const html = render(storyEntries);
    const links = [...html.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(([, href, title]) => [href, title]);
    expect(links).toEqual(storyEntries.map((entry) => [`/journeys/${entry.id}/`, entry.title]));
  });

  it('shows what a journey is about and how much it holds', () => {
    const html = render([campusEntry]);
    expect(html).toContain('Journey 01 · Campus orientation · Freie Universität Berlin');
    expect(html).toContain(`<span>${campusEntry.steps.length} steps</span><span>3 phases</span>`);
    expect(html).toContain('www.fu-berlin.de/vv/de/lv/123456');
  });

  it('counts one of a kind in the singular', () => {
    expect(render([longTextEntry])).toContain('<span>1 phase</span>');
  });

  it('leaves out what was never written', () => {
    const html = render([untitledEntry]);
    expect(html).not.toContain('phases');
    expect(html).not.toContain('journey__subject');
  });

  it('says so when there are none', () => {
    expect(render([])).toContain('No journeys yet.');
  });
});
