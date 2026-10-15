import { useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { getJourneyTemplate, REPORT_VERSION } from '@openuji/journey';
import { storyReportWithClip } from '@openuji/journey/fixtures';
import { Button, ReportView, TranslationProvider, useTranslation } from '@openuji/design-system';
import { ExtensionTranslationProvider } from '../../localisation/TranslationProvider';
import { downloadReport } from '../../lib/report-download';
import { PanelView } from './PanelView';
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
  return <PanelView {...args} onOpenReport={() => setReportOpen(true)} />;
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
