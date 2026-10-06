import type { Meta, StoryObj } from '@storybook/react-vite';
import { X } from 'lucide-react';
import { Alert } from './Alert';
import { IconButton } from './IconButton';
import { StatusBadge } from './StatusBadge';

function FeedbackPrimitives() {
  return (
    <div className="story-surface story-stack">
      <div className="story-cluster">
        <StatusBadge tone="live">REC</StatusBadge>
        <StatusBadge>Finishing…</StatusBadge>
      </div>
      <IconButton label="Dismiss"><X size={16} /></IconButton>
      <div style={{ width: 'min(100%, 420px)' }}>
        <Alert onDismiss={() => undefined}>
          Another debugger is already attached to this tab.
        </Alert>
      </div>
    </div>
  );
}

const meta = {
  title: 'Primitives/Feedback',
  component: FeedbackPrimitives,
  parameters: { viewport: { disable: true } },
} satisfies Meta<typeof FeedbackPrimitives>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStates: Story = {};
