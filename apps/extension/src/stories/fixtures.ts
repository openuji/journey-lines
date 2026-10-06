import type { MilestoneCapture } from '@openuji/core';
import type { TabSummary } from '../lib/protocol';

export const STORY_STARTED_AT_MS = 1_700_000_000_000;

export const storyTab: TabSummary = {
  id: 7,
  title: 'Journey Lines research workspace',
  url: 'https://journey-lines.example/research/current?team=fu',
};

// A generated 64×36 Journey Lines scene: representative, compact, and free of private data.
const STORY_FRAME =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAkCAIAAAC2bqvFAAAENUlEQVR4nOxXS28cRRCu6p7xruSw4RGIje0LiMhISD6AEnHgFyAEF05IgTsX+AFISMAZ/kK4AhduHAkSIkJwxSzikVjGzsNx7MRRvDPdlX7OdM9jvRPbkhVte137Tc1MbU/VV/31JNvbNySBkCCUJZKEQpJQlrSVAVZ+6bC+PsZFhElxbu+KcRltEmyiJQhmoPoDJHOEqL/I2ABb6DFUsY0QRbNYBcUYkwlmbICBzFl7KUGMfWSo/kpC/gSZj0UUeA12PwD6CYliTCW2/x6XEaiGyfxehO0V4Z0FLn01nLQ9mc/ZSa9MEmadXKZDrAaSzzoFWafGrJNLEVE7rlWGPCaX9QhDiaGGaz1w5vRgJk0BShYV9XKYmpw1/zgnONZAzU/U5AwOhlvZF5d3QtZUe8DNHloGjfO33nV046Vn0koPMPQMrXR688Bxfpz8+i4Dq4cYzjmJ2Vn0f0OgsJRN55pOHkVRqHpI4ZxZ2QO6DXCUZVAsIPFA6F6Box5/bWXRmoa1Hri1s9uknSdIoac6cMJ14PNPP/lzddUF9WWCAFPQr424uH7+heW3P/ysU9axNetFbaurZbUHhnb2EAyaFFPs3/hntXi0etah274I2vZFVR04t7wMlfUEI4wtfgiIboeqgF25TC7Rf6Nbxh2yGGoYXHPFGGo6gNP3gen7AEzfB4pMPw46MD7rMEHWaWNXbu5JTAQmOSRSeZlAzDkTjImUmUWBCWC5tgZfT1eOTAeqOOoBr1Lt/SC//11cf5DzXs771kqOLN1nyYilI0z2jQ1wOlKnCPMN9uqj6UDS9mSdK7O2Bb/+TZt7wPtmzXcbXL+222i+eIUkGN9z+W8wI9fhfPd+aHgfaOA9Bbwnz/WoB67dgG9/Jt5Ts9dx507xuScJE0BNIUsVoa2mjeGPJpKyvfz/WVpTt5yVV3bY3B1a6tAPZirVHhh8/VWO3NJXW0dlXsH2EOzn2k1YvyPU7I2Y8jdfwbMDqfkErBRHK0N1oXx5Ye+HWbyqbl3m3/yB727TEsAhdOCJS19mlsGslyfG8n5mCM1ZX3mY8QDvEe8T01aYQx1i4Wn22jk5N4hX8wN04FZvZXZ01ZZ7Kb18O3vvcDpgNyOO5X4D43mM/jr/AufOart4hr1zwRe3gw7c5/P/zrz1In2nXAO2tnLqkiISGIKRWqlQKltQTrX7leEH43Tg7sWPFUkMWxRV0oI82gPGg+VZ5ZGa5VwuLdDis0T0aDpwD+c36Pzz8JNynU7/eyod+vWqXLVYsm+XrF+G74/Tgd2LH43ZeDVuqlw4CQ1Zp0nVd5NdACkW8cdwOkWJA0Ycsw5U90XQYV+0Tq9DJigXNBIxbRx5DKnEselAp31RS2XWsjcO3NIfjw4cyPsKdhHASy6U7XNIHahnF7tmFyblfadd56Q6EPC+3gPT94FjqMxDAAAA//8YhIXaAAAABklEQVQDAKxFXL79WQ4rAAAAAElFTkSuQmCC';

function capture({
  index,
  viewId,
  label,
  detail,
  url,
}: {
  index: number;
  viewId: number;
  label: string;
  detail: string;
  url?: string;
}): MilestoneCapture {
  return {
    viewId,
    entry: viewId === 1 ? 'load' : 'route',
    documentId: 1,
    loaderId: 'story-loader',
    url: url ?? (viewId === 1 ? storyTab.url : 'https://journey-lines.example/research/findings'),
    label,
    detail,
    frame: {
      index,
      base64: STORY_FRAME,
      scrollX: 0,
      scrollY: index > 3 ? 620 : 0,
      viewportWidth: 1280,
      viewportHeight: 720,
      pageScaleFactor: 1,
      receivedAtMs: STORY_STARTED_AT_MS + index * 4_400,
    },
  };
}

export const storyCaptures: readonly MilestoneCapture[] = [
  capture({ index: 1, viewId: 1, label: '00-first', detail: 'First visual compositor frame for this document' }),
  capture({ index: 2, viewId: 1, label: '10-pre-click-01', detail: 'Pre-click state on <button> “Open study”' }),
  capture({ index: 3, viewId: 1, label: '11-post-click-01', detail: 'Compositor response after clicking <button>' }),
  capture({ index: 4, viewId: 1, label: '03-pre-scroll-01', detail: 'Pre-scroll #1 of the page at (0, 0)' }),
  capture({ index: 5, viewId: 1, label: '04-post-scroll-01', detail: 'Post-scroll #1 of the page: (0, 0) → (0, 620)' }),
  capture({ index: 6, viewId: 1, label: '99-before-navigation', detail: 'Route change; preserving the final resting state' }),
  capture({ index: 7, viewId: 2, label: '00-first', detail: 'First compositor frame after the route change' }),
  capture({ index: 8, viewId: 2, label: '10-pre-click-01', detail: 'Pre-click state on <article> “Finding 04”' }),
  capture({ index: 9, viewId: 2, label: '11-post-click-01', detail: 'Compositor response after clicking <article>' }),
];

export const captureKindExamples = storyCaptures.slice(0, 1).concat(
  storyCaptures.slice(1, 2),
  storyCaptures.slice(3, 4),
  storyCaptures.slice(5, 6),
);

export const longStoryCaptures: readonly MilestoneCapture[] = Array.from({ length: 28 }, (_, i) => {
  const index = i + 1;
  const viewId = Math.floor(i / 7) + 1;
  const event = i % 4;
  const labels = [
    '00-first',
    `10-pre-click-${String(index).padStart(2, '0')}`,
    `11-post-click-${String(index).padStart(2, '0')}`,
    `04-post-scroll-${String(index).padStart(2, '0')}`,
  ];
  return capture({
    index,
    viewId,
    label: labels[event] ?? '00-first',
    detail: `Synthetic journey capture ${index} for responsive and scrolling review`,
    url: `https://journey-lines.example/research/view-${viewId}`,
  });
});
