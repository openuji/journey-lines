import { useEffect, useMemo, useState } from 'react';
import { Route } from 'lucide-react';
import type { Clip, MilestoneCapture } from '@openuji/core';
import { captureKind, formatClock, frameSrc, journeyRows, shortUrl } from '../../lib/journey';
import { recordingArtifacts, zipStored } from '../../lib/report-archive';
import { loadReport } from '../../lib/report-port';
import type { StoredRecording } from '../../lib/recording-store';
import { Button } from '../../ui/Button';
import { ClipVideo } from '../../ui/ClipVideo';

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url || 'Recording'; }
}

function titleOf(session: StoredRecording): string {
  return session.meta.tab.title || shortUrl(session.meta.tab.url) || 'Recording';
}

export function Report() {
  const sessionId = new URLSearchParams(location.search).get('session');
  const [session, setSession] = useState<StoredRecording | null>(null);
  const [error, setError] = useState<string | null>(sessionId ? null : 'No recording specified.');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const loading = loadReport(sessionId);
    void loading.promise.then(
      (recording) => { if (active) { setSession(recording); setError(null); } },
      (reason: unknown) => { if (active) setError(String(reason instanceof Error ? reason.message : reason)); },
    );
    return () => { active = false; loading.close(); };
  }, [sessionId]);

  const captures = useMemo(() => session?.items.flatMap((item) => item.kind === 'capture' ? [item.capture] : []) ?? [], [session]);
  const clips = useMemo(() => session?.items.flatMap((item) => item.kind === 'clip' ? [item.clip] : []) ?? [], [session]);
  const rows = useMemo(() => session ? journeyRows(captures, session.meta.startedAtMs, clips) : [], [session, captures, clips]);

  useEffect(() => {
    if (session) document.title = `${titleOf(session)} — Recording report`;
  }, [session]);

  const download = (): void => {
    if (!session || downloading) return;
    setDownloading(true);
    try {
      const archive = zipStored(recordingArtifacts(session.items));
      const url = URL.createObjectURL(new Blob([archive], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `recording-${session.meta.id}.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) {
      setError(`Download failed: ${String(reason)}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <header className="report-bar">
        <div className="report-bar__brand">
          <Route size={20} aria-hidden />
          <span title={session ? titleOf(session) : 'Recording report'}>{session ? titleOf(session) : 'Recording report'}</span>
        </div>
        {session && (
          <>
            <div className="report-bar__meta">
              {formatClock(session.meta.endedAtMs - session.meta.startedAtMs)} · {captures.length} captures
            </div>
            <Button variant="primary" size="small" onClick={download} disabled={downloading}>
              {downloading ? 'Preparing…' : 'Download .zip'}
            </Button>
          </>
        )}
      </header>
      <main className="report-doc">
        {error && <p className="report-message" role="alert">{error}</p>}
        {!error && !session && <p className="report-message" role="status">Loading report…</p>}
        {session && (
          <>
            <div className="report-head">
              <h1>{titleOf(session)}</h1>
              <div className="report-head__meta">
                <span>{hostOf(session.meta.tab.url)}</span>
                <span aria-hidden>·</span>
                <span>{formatClock(session.meta.endedAtMs - session.meta.startedAtMs)}</span>
                <span aria-hidden>·</span>
                <time dateTime={new Date(session.meta.startedAtMs).toISOString()}>
                  {new Date(session.meta.startedAtMs).toLocaleString()}
                </time>
              </div>
            </div>
            {rows.length === 0 && <p className="report-message">No captures were recorded.</p>}
            <div className="report-timeline">
              {rows.map((row) => row.kind === 'view' ? (
                <div className="report-view" key={row.key}>
                  <Route size={16} aria-hidden />
                  <span>{shortUrl(row.url)}</span>
                  <span className="report-view__entry">{row.entry}</span>
                </div>
              ) : (
                <CaptureBlock
                  key={row.key}
                  capture={row.capture}
                  atMs={row.atMs}
                  clip={row.clip}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}

function CaptureBlock({ capture, atMs, clip }: {
  capture: MilestoneCapture;
  atMs: number;
  clip?: Clip;
}) {
  return (
    <section className="report-capture">
      <div className="report-capture__heading">
        <time className="report-time">{formatClock(atMs)}</time>
        <span className="report-tag">{captureKind(capture.label)}</span>
        <div className="report-capture__text">
          <span className="report-capture__label">{capture.label}</span>
          <span className="report-capture__detail">{capture.detail}</span>
        </div>
      </div>
      <a className="report-capture__image-link" href={frameSrc(capture)} target="_blank" rel="noreferrer" aria-label={`Open full-size frame for ${capture.label}`}>
        <img src={frameSrc(capture)} alt={`Frame for ${capture.label}`} loading="lazy" />
      </a>
      {clip && (
        <div className="report-capture__clip">
          <div className="report-capture__heading">
            <span className="report-time" />
            <span className="report-tag">video</span>
            <span>Scroll clip</span>
          </div>
          <ClipVideo clip={clip} className="report-capture__video" />
        </div>
      )}
    </section>
  );
}
