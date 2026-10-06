import { useLayoutEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowDownUp, Camera, LogOut, MousePointerClick } from 'lucide-react';
import { useGlobals } from 'storybook/preview-api';

const colors = [
  ['Canvas', '--ds-color-canvas'],
  ['Surface', '--ds-color-surface'],
  ['Raised', '--ds-color-surface-raised'],
  ['Ink', '--ds-color-ink'],
  ['Secondary ink', '--ds-color-ink-muted'],
  ['Muted', '--ds-color-ink-soft'],
  ['Line', '--ds-color-line'],
  ['Accent', '--ds-color-accent'],
  ['Focus', '--ds-color-focus'],
  ['Success', '--ds-color-success'],
  ['Error', '--ds-color-error'],
] as const;

const spaces = [1, 2, 3, 4, 5, 6, 8] as const;

function Foundations({ themeKey = 'default' }: { themeKey?: string }) {
  return (
    <div className="story-surface">
      <section className="foundation-section">
        <h1 className="foundation-title">Color</h1>
        <div className="foundation-grid">
          {colors.map(([name, token]) => (
            <ColorSwatch key={`${themeKey}:${token}`} name={name} token={token} />
          ))}
        </div>
      </section>

      <section className="foundation-section story-stack">
        <h2 className="foundation-title">Typography</h2>
        <p className="type-sample type-sample--title">Title · Journey recorder</p>
        <p className="type-sample type-sample--body">Body · Capture journeys in the browser.</p>
        <p className="type-sample type-sample--label">Label · RECORDING ACTIVE</p>
        <p className="type-sample type-sample--meta">Meta · 03-pre-scroll-01 · 01:24</p>
      </section>

      <section className="foundation-section story-stack">
        <h2 className="foundation-title">Spacing</h2>
        {spaces.map((space) => (
          <div className="space-token" key={space}>
            <span className="token-label">--ds-space-{space}</span>
            <span
              className="space-token__bar"
              style={{ width: `var(--ds-space-${space})` }}
              role="img"
              aria-label={`${space * 4} pixels`}
            />
          </div>
        ))}
      </section>

      <section className="foundation-section story-cluster">
        <RadiusToken label="Control" themeKey={themeKey} token="--ds-radius-control" />
        <RadiusToken label="Thumbnail" themeKey={themeKey} token="--ds-radius-thumbnail" />
        <RadiusToken label="Primary" themeKey={themeKey} token="--ds-button-primary-radius" />
      </section>

      <section className="foundation-section story-stack">
        <h2 className="foundation-title">Focus and event icons</h2>
        <button className="foundation-focus-sample" type="button">
          Focus-visible ring
        </button>
        <div className="icon-foundation">
          <span><Camera className="icon-foundation--view" />View</span>
          <span><MousePointerClick className="icon-foundation--click" />Click</span>
          <span><ArrowDownUp className="icon-foundation--scroll" />Scroll</span>
          <span><LogOut className="icon-foundation--leave" />Leave</span>
        </div>
      </section>
    </div>
  );
}

function ColorSwatch({ name, token }: { name: string; token: string }) {
  const swatch = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState('');
  const [foreground, setForeground] = useState('CanvasText');

  useLayoutEffect(() => {
    const element = swatch.current;
    if (!element) return;
    const background = getComputedStyle(element).backgroundColor;
    setValue(background);
    setForeground(readableForeground(background));
  }, []);

  return (
    <div
      ref={swatch}
      className="color-swatch"
      style={{ background: `var(${token})`, color: foreground }}
    >
      <strong>{name}</strong>
      <span>{token}</span>
      <span>{value}</span>
    </div>
  );
}

function RadiusToken({
  label,
  token,
  themeKey,
}: {
  label: string;
  token: string;
  themeKey: string;
}) {
  const sample = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState('');

  useLayoutEffect(() => {
    if (sample.current) setValue(getComputedStyle(sample.current).borderRadius);
  }, [themeKey]);

  return (
    <div className="story-stack">
      <span className="token-label">{label} · {value}</span>
      <span ref={sample} className="radius-token" style={{ borderRadius: `var(${token})` }} />
    </div>
  );
}

function readableForeground(color: string): 'black' | 'white' {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length < 3) return 'black';
  const luminance = channels
    .map((channel) => channel / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? 'black' : 'white';
}

const meta = {
  title: 'Foundations/Tokens',
  component: Foundations,
  parameters: { viewport: { disable: true } },
} satisfies Meta<typeof Foundations>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllFoundations: Story = {
  render: () => {
    const [globals] = useGlobals();
    const themeKey = String(globals['colorMode']);
    return <Foundations themeKey={themeKey} />;
  },
};
