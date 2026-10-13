import { useReducer } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { emptyDraft, journeyTemplate, reportReducer, type ReportDraft } from '@openuji/journey';
import { campusDraft, longTextDraft } from '@openuji/journey/fixtures';
import { TagEditor } from './TagEditor';

/** Story-only: holds the draft's tags, as the report editor does. */
function TagPlayground({ draft, suggestions }: { draft: ReportDraft; suggestions?: readonly string[] }) {
  const [current, dispatch] = useReducer(reportReducer, draft);
  return (
    <div className="story-surface">
      <TagEditor
        tags={current.tags}
        suggestions={suggestions}
        wording={journeyTemplate.tags}
        onAdd={(tag) => dispatch({ type: 'addTag', tag })}
        onRemove={(tag) => dispatch({ type: 'removeTag', tag })}
      />
    </div>
  );
}

const meta = {
  title: 'Report/Tag editor',
  component: TagPlayground,
  args: { draft: campusDraft, suggestions: ['Freie Universität Berlin', 'Wintersemester 2026/27', 'Course registration'] },
  argTypes: { draft: { control: false } },
} satisfies Meta<typeof TagPlayground>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Suggestions already used are not offered again. */
export const Default: Story = {};
export const Empty: Story = { args: { draft: emptyDraft } };
export const NoSuggestions: Story = { args: { suggestions: [] } };
export const LongTags: Story = { args: { draft: longTextDraft } };
