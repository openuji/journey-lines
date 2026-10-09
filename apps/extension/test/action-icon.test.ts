import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActionIcon } from '../src/lib/action-icon';

const setIcon = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  setIcon.mockClear();
  vi.stubGlobal('chrome', { action: { setIcon } });
});

describe('action icon', () => {
  it('uses the monochrome favicon mark while the panel is closed', async () => {
    await setActionIcon(false);

    expect(setIcon).toHaveBeenCalledWith({ path: {
      16: 'icons/action-16.png',
      24: 'icons/action-24.png',
      32: 'icons/action-32.png',
    } });
  });

  it('uses the page logo spectrum while the panel is open', async () => {
    await setActionIcon(true);

    expect(setIcon).toHaveBeenCalledWith({ path: {
      16: 'icons/action-open-16.png',
      24: 'icons/action-open-24.png',
      32: 'icons/action-open-32.png',
    } });
  });
});
