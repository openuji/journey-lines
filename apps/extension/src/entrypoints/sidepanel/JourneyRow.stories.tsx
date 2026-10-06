import type { Meta, StoryObj } from '@storybook/react-vite';
import { captureKind } from '../../lib/journey';
import { captureKindExamples, STORY_STARTED_AT_MS, storyCaptures } from '../../stories/fixtures';
import { CaptureRow, ViewRow } from './JourneyRow';

function RowGallery() {
  return (
    <div className="story-surface">
      <ol className="journey story-journey">
        <ViewRow entry="load" url="https://journey-lines.example/research/current?team=fu" />
        {captureKindExamples.map((capture) => (
          <CaptureRow
            key={capture.label}
            capture={capture}
            captureKind={captureKind(capture.label)}
            atMs={capture.frame.receivedAtMs - STORY_STARTED_AT_MS}
          />
        ))}
        <ViewRow entry="route" url="https://journey-lines.example/research/findings/a-very-long-route-name" />
      </ol>
    </div>
  );
}

const meta = {
  title: 'Panel/Journey rows',
  component: RowGallery,
  parameters: { viewport: { disable: true } },
} satisfies Meta<typeof RowGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllKinds: Story = {};

export const ExpandedFrame: Story = {
  render: () => {
    const capture = storyCaptures[1]!;
    return (
      <div className="story-surface">
        <ol className="journey story-journey">
          <CaptureRow
            capture={capture}
            captureKind={captureKind(capture.label)}
            atMs={capture.frame.receivedAtMs - STORY_STARTED_AT_MS}
          />
        </ol>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('[aria-label="Expand frame"]')?.click();
  },
};
