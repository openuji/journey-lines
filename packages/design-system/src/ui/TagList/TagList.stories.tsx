import type { Meta, StoryObj } from '@storybook/react-vite';
import { campusDraft, longTextDraft } from '@openuji/journey/fixtures';
import { TagList } from './TagList';

const meta = {
  title: 'Primitives/Tag list',
  component: TagList,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: { tags: campusDraft.tags },
} satisfies Meta<typeof TagList>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Long: Story = { args: { tags: longTextDraft.tags } };
export const None: Story = { args: { tags: [] } };
