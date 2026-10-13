import { useEffect, useState } from 'react';
import { ReportReader, type ReportReaderProps } from '@openuji/design-system';
import { readReportArtifacts, unzipStored, type ReportExport } from '@openuji/journey';

type Loaded = Readonly<{ report: ReportExport | null; error: string | null }>;

async function readArchive(src: string): Promise<ReportExport> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`The report archive answered ${response.status}.`);
  return readReportArtifacts(unzipStored(new Uint8Array(await response.arrayBuffer())));
}

/**
 * The app's adapter, and its only state: one report archive, fetched and read
 * exactly as the extension wrote it, then shown as its readers see it.
 */
export function JourneyReport({ src, back }: { src: string; back: ReportReaderProps['back'] }) {
  const [loaded, setLoaded] = useState<Loaded>({ report: null, error: null });

  useEffect(() => {
    let active = true;
    void readArchive(src).then(
      (report) => { if (active) setLoaded({ report, error: null }); },
      (reason: unknown) => { if (active) setLoaded({ report: null, error: reason instanceof Error ? reason.message : String(reason) }); },
    );
    return () => { active = false; };
  }, [src]);

  return <ReportReader report={loaded.report} error={loaded.error} back={back} />;
}
