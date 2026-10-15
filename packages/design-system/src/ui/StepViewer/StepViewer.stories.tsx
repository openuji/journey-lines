import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { journeyEntry, type ReportExport } from '@journey-lines/journey';
import { campusReport, longTextReport, untitledReport } from '@journey-lines/journey/fixtures';
import { TranslationProvider } from '../../localisation/TranslationProvider';
import { translate, type Translator } from '../../localisation/translate';
import { storyMedia } from '../../stories/media';
import { readerSections } from '../ReaderDocument/reader-sections';
import { readerSlides, type ReaderMedia } from '../ReaderDocument/reader-slides';
import { Button } from '../Button/Button';
import { StepViewer, type StepViewerProps } from './StepViewer';
import { defaultView, type ViewerAt, type ViewerSlide } from './step-viewer';

/** A fixture report's steps, as the reader hands them to the viewer. */
const slidesOf = (report: ReportExport, media: ReaderMedia = storyMedia(report), t?: Translator) => {
  const entry = journeyEntry(report);
  return readerSlides(entry, readerSections(entry, t), media, t);
};

const campus = slidesOf(campusReport);
const indexWhere = (slides: readonly ViewerSlide[], test: (slide: ViewerSlide) => boolean) =>
  Math.max(0, slides.findIndex(test));
const withClip = indexWhere(campus, (slide) => slide.clip !== undefined);
const withoutClip = indexWhere(campus, (slide) => slide.frames.length > 1 && !slide.clip);
const at = (slides: readonly ViewerSlide[], index: number): ViewerAt => ({ index, view: defaultView(slides[index]!) });

/** The viewer open on `at`; closing it leaves a button to open it again. */
function Opened({ id, slides, at: initial }: StepViewerProps) {
  const [current, setCurrent] = useState<ViewerAt | null>(initial);
  return (
    <>
      <Button onClick={() => setCurrent(initial)}>Open the viewer</Button>
      <StepViewer id={id} slides={slides} at={current} onChange={setCurrent} />
    </>
  );
}

const meta = {
  title: 'Report/Step viewer',
  component: StepViewer,
  render: (args) => <Opened {...args} />,
  args: { id: 'story-step-viewer', slides: campus, at: at(campus, 0), onChange: fn() },
  argTypes: { slides: { control: false }, at: { control: false } },
  globals: { viewport: { value: 'responsive', isRotated: false } },
} satisfies Meta<typeof StepViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A page as it loaded, from the first step: there is no previous one. */
export const PageStep: Story = {};

/** An interaction opens on its clip, playing; before and after are a click away. */
export const InteractionVideo: Story = {
  args: { at: at(campus, withClip) },
};

export const InteractionBefore: Story = {
  args: { at: { index: withClip, view: 'before' } },
};

/** An interaction recorded without a clip: before and after only. */
export const NoClip: Story = {
  args: { at: at(campus, withoutClip) },
};

/** The last step: there is no next one. */
export const LastStep: Story = {
  args: { at: at(campus, campus.length - 1) },
};

/** Pictures that are not (yet) there. */
export const MissingMedia: Story = {
  args: { slides: slidesOf(campusReport, {}), at: at(campus, withClip) },
};

/** A phase that says a lot, and a long note: the title is cut short, the note scrolls in its room, the screen stays. */
export const LongPhaseTexts: Story = {
  args: { slides: slidesOf(longTextReport), at: at(slidesOf(longTextReport), 0) },
};

/** An address as long as a search: one line, cut short, the whole of it on hover. */
const searchAddress = 'https://www.google.com/search?q=einf%C3%BChrung+in+die+theoretische+philosophie+freie+universit%C3%A4t+berlin&sca_esv=e8250f0ca69a98a5&sxsrf=APpeQnvbF47gkkeymh1F-r0NzX4LOVJsiQ%3A1792053748727&source=hp&ei=9JHQasf9Koeti-gPsfL28Qs&iflsig=ABILxe8AAAAAatCgBCLTzQxXdIAVj-EMgr1T7VIGYg_e&oq=Einf%C3%BChrung&gs_lp=Egdnd3Mtd2l6Ij5FaW5mw7xocnVuZyBpbiBkaWUgdGhlb3JldGlzY2hlIFBoaWxvc29waGllIGZyZWllIHVuaXZlc2l0w6R0&sclient=gws-wiz';
export const LongAddress: Story = {
  args: {
    slides: campus.map((slide, index) => index === withClip ? { ...slide, url: searchAddress } : slide),
    at: at(campus, withClip),
  },
};

/** A step before any phase: no phase to tell, only the step. */
export const LeadStep: Story = {
  args: { slides: slidesOf(untitledReport), at: at(slidesOf(untitledReport), 0) },
};

export const Narrow: Story = {
  args: { at: at(campus, withClip) },
  globals: { viewport: { value: 'reportNarrow', isRotated: false } },
};

export const Dark: Story = {
  args: { at: at(campus, withClip) },
  globals: { colorMode: 'dark', viewport: { value: 'responsive', isRotated: false } },
};

export const German: Story = {
  args: { slides: slidesOf(campusReport, storyMedia(campusReport), (key, parameters) => translate(key, 'de', parameters)), at: at(campus, withClip) },
  decorators: [(Story) => <TranslationProvider language="de"><Story /></TranslationProvider>],
};

/** Arrows and keys mirror: the previous step is to the right. */
export const EnglishRtl: Story = {
  args: { at: at(campus, withClip) },
  decorators: [(Story) => <TranslationProvider language="en" dir="rtl"><div dir="rtl"><Story /></div></TranslationProvider>],
};
