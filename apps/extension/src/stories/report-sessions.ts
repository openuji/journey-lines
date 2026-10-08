import type { Clip, MilestoneCapture } from '@openuji/core';
import type { RecordingItem, StoredRecording } from '../lib/recording-store';
import { longStoryCaptures, STORY_STARTED_AT_MS, storyCaptures, storyTab } from './fixtures';

// A tiny playable WebM encoded from the existing synthetic PNG fixture with
// the project's own clip encoder. No private recording data is checked in.
const STORY_WEBM =
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAN9EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEgTbuMU6uEHFO7a1OsggNn7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDBXQYxMYXZmNjMuMS4xMDBEiYhAdAAAAAAAABZUrmvFrgEAAAAAAAA814EBc8WItyl4+ZzyJsucgQAitZyDdW5kiIEAhoVWX1ZQOIOBAeCGsIEguoESVe6BAOwBAAAAAAAAAgAAElTDZ9dzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYzLjEuMTAwc3OyY8CLY8WItyl4+ZzyJstnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAwLjMyMDAwMDAwMAAfQ7Z1QeXngQCjQaqBAACAEAoAnQEqIAASAAAHCIWFiJmEiAICAnW6JMG+V/kByDO1vdvJB/Afxn/S/dnigP8B9AH/QeqTeW/7AfA9+wHo33LOunxyttRcpXVzc47LTFtzGywuqzz35tjA/v/+s915w6ev3af2PR691MN2P/B58V+f1TNNf/PobVTH9hpqr0F4RL2gf/YArF+gQsu/qDv+6NZn/jtpQoWW2u9MWHa/LvZVLbdeAGkx/kQi/uIxQdcRvrI0RRmblGHEQf4l5vIDtRFP/+MVxYDem2Bz3WeP4C/y8tcVp7mPnynwWmP/yhH1ykLFOYj6PdHQvX3HH/sBfwzRUjePh1uvwfqHm0/CQFZo0j/4I0svxiaLlT7Ide4a+Va22a2N37ZJKEmvvj37BO5WzJM78sYatRFVIGlmZPFhaAPFONiGfjN6w7jJv1kzRLcIsNZZDZzVL5wO/ht2l9sP/qf03r/x1iB3b/7eIPgmvUrZOGOM2VFXz/0lZ9/yJYU/1jmlm1U+zGF3dFVCvxq2oXslwRCQe8tsEg7nsxfFQANTchzksbv7VJ/pClsIa6ypcQCjmYEAoADxAQABEDAAGA2MSxgRu5BEnUDFfgCjmIEBQADRAQABEDAAGAAeQC/0ALxHAMV+ABxTu2uRu4+zgQC3iveBAfGCAXzwgQM=';

const captureItems = (captures: readonly MilestoneCapture[]): RecordingItem[] => captures.map((capture) => ({
  kind: 'capture',
  epochMs: capture.frame.receivedAtMs,
  capture,
}));

const scrollCapture = storyCaptures.find((capture) => capture.label === '04-post-scroll-01')!;
const scrollClip: Clip = {
  viewId: scrollCapture.viewId,
  entry: scrollCapture.entry,
  documentId: scrollCapture.documentId,
  loaderId: scrollCapture.loaderId,
  url: scrollCapture.url,
  label: scrollCapture.label,
  mimeType: 'video/webm',
  base64: STORY_WEBM,
  trace: [
    { frameIndex: 0, atMs: 0, x: 0, y: 0 },
    { frameIndex: 1, atMs: 160, x: 0, y: 620 },
  ],
};

function recording(id: string, items: readonly RecordingItem[]): StoredRecording {
  return {
    meta: {
      id,
      tab: storyTab,
      startedAtMs: STORY_STARTED_AT_MS,
      endedAtMs: STORY_STARTED_AT_MS + 94_000,
      endedBy: 'user',
      droppedFrames: 0,
    },
    items,
  };
}

export const storyReport = recording('ses_storybook', captureItems(storyCaptures));
export const storyReportWithClip = recording('ses_storybook_clip', [
  ...captureItems(storyCaptures.slice(0, 5)),
  { kind: 'clip', epochMs: scrollCapture.frame.receivedAtMs + 160, clip: scrollClip },
  ...captureItems(storyCaptures.slice(5)),
]);
export const storyLongReport = recording('ses_storybook_long', captureItems(longStoryCaptures));
export const storyEmptyReport = recording('ses_storybook_empty', []);
