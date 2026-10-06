import type { Meta, StoryObj } from '@storybook/react-vite';
import { PanelView } from './App';
import {
  donePanelState,
  droppedFramesRecorderStatus,
  idlePanelState,
  interruptedRecorderStatus,
  liveLongStoryCaptures,
  recordingPanelState,
  stoppingRecorderStatus,
} from '../../stories/panel-states';

const meta = {
  title: 'Panel/Complete states',
  component: PanelView,
  args: {
    state: idlePanelState,
    onRecord: () => undefined,
    onStop: () => undefined,
    onReset: () => undefined,
    onDismissError: () => undefined,
  },
} satisfies Meta<typeof PanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connecting: Story = {
  args: {
    state: { ...idlePanelState, connected: false },
  },
};

export const Idle: Story = {};

export const Error: Story = {
  args: {
    state: {
      ...idlePanelState,
      error: 'Another debugger is already attached to this tab. Close DevTools and try again.',
    },
  },
};

export const RecordingEmpty: Story = {
  args: {
    state: {
      ...recordingPanelState,
      captures: [],
    },
  },
};

export const RecordingPopulated: Story = {
  args: { state: recordingPanelState },
};

export const Stopping: Story = {
  args: {
    state: {
      ...recordingPanelState,
      status: stoppingRecorderStatus,
    },
  },
};

export const Completed: Story = {
  args: { state: donePanelState },
};

export const Interrupted: Story = {
  args: {
    state: {
      ...donePanelState,
      status: interruptedRecorderStatus,
    },
  },
};

export const DroppedFrames: Story = {
  args: {
    state: {
      ...donePanelState,
      status: droppedFramesRecorderStatus,
    },
  },
};

export const LongJourney: Story = {
  args: {
    state: {
      ...recordingPanelState,
      captures: liveLongStoryCaptures,
    },
  },
};

export const NarrowPanel: Story = {
  args: { state: recordingPanelState },
  globals: {
    viewport: { value: 'panelNarrow', isRotated: false },
  },
};

export const WidePanel: Story = {
  args: { state: donePanelState },
  globals: {
    viewport: { value: 'panelWide', isRotated: false },
  },
};
