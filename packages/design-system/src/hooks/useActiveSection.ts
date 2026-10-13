import { useEffect, useState } from 'react';

/**
 * The section being read: the first of `ids` whose element crosses a band
 * just below the top of the window, where the bar or a pinned headline ends.
 * The window is the only source; nothing here is set by the reader's clicks.
 */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join(' ');

  useEffect(() => {
    const order = key.split(' ');
    const crossing = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) crossing.add(entry.target.id);
        else crossing.delete(entry.target.id);
      }
      const current = order.find((id) => crossing.has(id));
      if (current) setActive(current);
    }, { rootMargin: '-72px 0px -70% 0px' });
    for (const id of order) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [key]);

  return active;
}
