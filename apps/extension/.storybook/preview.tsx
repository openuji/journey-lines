import type { Preview } from '@storybook/react-vite';
import { useGlobals } from 'storybook/preview-api';
import '../src/ui/styles.css';
import '../src/entrypoints/sidepanel/styles.css';
import '../src/entrypoints/report/styles.css';
import '../src/stories/storybook.css';

const COLOR_MODES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const;

type ColorMode = (typeof COLOR_MODES)[number]['id'];

function isColorMode(value: unknown): value is ColorMode {
  return COLOR_MODES.some((mode) => mode.id === value);
}

const preview: Preview = {
  globalTypes: {
    colorMode: {
      description: 'Color mode',
      toolbar: {
        icon: 'contrast',
        dynamicTitle: true,
        items: COLOR_MODES.map((mode) => ({ value: mode.id, title: mode.label })),
      },
    },
  },
  decorators: [
    (Story) => {
      const [globals] = useGlobals();
      const mode = isColorMode(globals['colorMode']) ? globals['colorMode'] : 'system';
      document.documentElement.dataset['colorMode'] = mode;

      return <Story />;
    },
  ],
  parameters: {
    layout: 'fullscreen',
    controls: {
      expanded: true,
      sort: 'requiredFirst',
    },
    a11y: {
      test: 'error',
    },
    viewport: {
      options: {
        responsive: {
          name: 'Responsive',
          styles: { width: '100%', height: '100%' },
          type: 'other',
        },
        panelNarrow: {
          name: 'Side panel · 320',
          styles: { width: '320px', height: '800px' },
          type: 'other',
        },
        panelDefault: {
          name: 'Side panel · 360',
          styles: { width: '360px', height: '800px' },
          type: 'other',
        },
        panelWide: {
          name: 'Side panel · 480',
          styles: { width: '480px', height: '800px' },
          type: 'other',
        },
        reportNarrow: {
          name: 'Report · 390',
          styles: { width: '390px', height: '800px' },
          type: 'other',
        },
        reportDesktop: {
          name: 'Report · 1280',
          styles: { width: '1280px', height: '800px' },
          type: 'other',
        },
      },
    },
  },
  initialGlobals: {
    colorMode: 'system',
    viewport: { value: 'panelDefault', isRotated: false },
  },
};

export default preview;
