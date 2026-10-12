import type { Meta, StoryObj } from '@storybook/react-vite';
import { FloatingPreview } from './FloatingPreview';

const meta = {
  title: 'Media/Floating preview',
  component: FloatingPreview,
  args: {
    id: 'floating-story-preview',
    anchor: { left: 160, right: 160, top: 300, bottom: 304 },
    onDismiss: () => {},
    children: <span>Frame preview</span>,
  },
} satisfies Meta<typeof FloatingPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Above: Story = {};
export const NearTop: Story = { args: { anchor: { left: 0, right: 0, top: 8, bottom: 12 } } };
