import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { getJourneyTemplate, REPORT_VERSION } from '@journey-lines/journey';
import { storyReportWithClip } from '@journey-lines/journey/fixtures';
import { Button, ReportView, TranslationProvider, useTranslation } from '@journey-lines/design-system';
import { ExtensionTranslationProvider } from '../../localisation/TranslationProvider';
import { downloadReport } from '../../lib/report-download';
import { PanelView } from './PanelView';
import { Settings } from '../Settings/Settings';
import { createStorySettings } from '../../stories/settings';
import {
  donePanelState,
  droppedFramesRecorderStatus,
  idlePanelState,
  interruptedRecorderStatus,
  liveLongStoryCaptures,
  recordingPanelState,
  stoppingRecorderStatus,
} from '../../stories/panel-states';

function PanelPreview(args: ComponentProps<typeof PanelView>) {
  const { t, language: scopedLanguage } = useTranslation();
  const language = scopedLanguage === 'de' ? 'de' : 'en';
  const [reportOpen, setReportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsStorage] = useState(() => createStorySettings());
  if (settingsOpen) {
    return <>
      <Settings storage={settingsStorage} />
      <Button className="story-report-back" size="small" onClick={() => setSettingsOpen(false)}>
        {t('panel.back')}
      </Button>
    </>;
  }
  if (reportOpen) {
    return (
      <>
        <ReportView
          session={storyReportWithClip}
          locale={{ language, dir: 'ltr' }}
          onDownload={(draft) => downloadReport({ version: REPORT_VERSION, template: getJourneyTemplate(language), draft, recording: storyReportWithClip })}
        />
        <Button className="story-report-back" size="small" onClick={() => setReportOpen(false)}>
          {t('panel.back')}
        </Button>
      </>
    );
  }
  return <PanelView {...args} onOpenReport={() => setReportOpen(true)} onOpenSettings={() => setSettingsOpen(true)} />;
}

const meta = {
  title: 'Panel/Complete states',
  component: PanelView,
  decorators: [(Story) => <ExtensionTranslationProvider language="en"><Story /></ExtensionTranslationProvider>],
  render: (args) => <PanelPreview {...args} />,
  args: {
    state: idlePanelState,
    onRecord: () => undefined,
    onStop: () => undefined,
    onReset: () => undefined,
    onOpenReport: () => undefined,
    onDismissError: () => undefined,
    onOpenSettings: () => undefined,
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

export const SettingsNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }));
    const pause = await canvas.findByLabelText('Visual pause before ending a click (seconds)');
    await waitFor(() => expect(pause).toBeEnabled());
    await userEvent.clear(pause);
    await userEvent.type(pause, '1');
    const maximum = canvas.getByLabelText('Maximum click observation time (seconds)');
    await userEvent.clear(maximum);
    await userEvent.type(maximum, '5');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Saved.'));
    await userEvent.click(canvas.getByRole('button', { name: 'Back to panel' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Settings' }));
    await waitFor(() => expect(canvas.getByLabelText('Visual pause before ending a click (seconds)')).toHaveValue(1));
    await expect(canvas.getByLabelText('Maximum click observation time (seconds)')).toHaveValue(5);
  },
};

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

export const German: Story = {
  args: { state: donePanelState },
  decorators: [(Story) => <TranslationProvider language="de"><Story /></TranslationProvider>],
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
