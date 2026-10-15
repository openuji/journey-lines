import { reportArtifacts, zipStored, type ReportExport } from '@journey-lines/journey';

/** Browser-only save action shared by the extension page and Storybook demos. */
export function downloadReport(report: ReportExport): void {
  const archive = zipStored(reportArtifacts(report));
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `recording-${report.recording.meta.id}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
