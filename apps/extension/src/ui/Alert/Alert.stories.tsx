import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert } from './Alert';

const meta = {
  title: 'Primitives/Alert',
  component: Alert,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: { children: 'Another debugger is already attached to this tab.', onDismiss: () => undefined },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
