import type { Meta, StoryObj } from '@storybook/react-vite';
import { GitHubLink } from './GitHubLink';

const meta = {
  title: 'Primitives/GitHub link',
  component: GitHubLink,
  args: { href: 'https://github.com/openuji/journey-lines', label: 'View project on GitHub' },
} satisfies Meta<typeof GitHubLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Dark: Story = {
  globals: { colorMode: 'dark' },
};
