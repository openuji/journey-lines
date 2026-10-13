import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EditableText } from './EditableText';

const meta = {
  title: 'Primitives/EditableText',
  component: EditableText,
  decorators: [(Story) => <div className="story-surface"><Story /></div>],
  args: {
    value: 'On the course page I find the location “Hs 1b Hörsaal, Habelschwerdter Allee 45”.',
    label: 'What happens?',
    placeholder: 'What the person did and saw',
    editing: true,
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <EditableText {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof EditableText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editing: Story = {};

export const EditingEmpty: Story = {
  args: { value: '' },
};

export const Reading: Story = {
  args: { editing: false },
};

/** Read mode renders nothing for an empty or blank text. */
export const ReadingEmpty: Story = {
  args: { editing: false, value: '   ' },
};
