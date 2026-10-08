import type { StoredRecording } from './recording-store';
import { recordingArtifacts, zipStored } from './report-archive';

/** Browser-only save action shared by the extension page and Storybook demos. */
export function downloadReport(session: StoredRecording): void {
  const archive = zipStored(recordingArtifacts(session.items));
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `recording-${session.meta.id}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
