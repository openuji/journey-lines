import type { TabHost } from '@journey-lines/cdp';
import type { CaptureSink, ClipSink, MilestoneCapture } from '@journey-lines/core';
import type { TargetElementMeta } from '@journey-lines/core/wire';
import { compilePrivacy } from './compile.js';
import type { PrivacyMetadataField, PrivacyProfile } from './profile.js';
import { privacyHost, type PrivacyReporter } from './recording-host.js';
import { matchesScope } from './scope.js';

/** Select once at the application boundary; navigation and engine inputs stay functional. */
export function createPrivacy(profile: PrivacyProfile, options: { onDiagnostic?: PrivacyReporter } = {}) {
  const program = compilePrivacy(profile);
  const report: PrivacyReporter = options.onDiagnostic ?? ((diagnostic) => {
    if ('level' in diagnostic && diagnostic.level === 'warning') console.warn('[privacy]', diagnostic);
  });
  const transform = (value: string, field: PrivacyMetadataField, sourceUrl: string): string => {
    let location: URL;
    try { location = new URL(sourceUrl); } catch { return value; }
    for (const rule of program.metadata ?? []) {
      if (!rule.fields.includes(field) || !rule.scopes.some((scope) => matchesScope(scope, location))) continue;
      value = value.replace(new RegExp(rule.pattern, rule.flags), rule.replacement);
    }
    return value;
  };
  const sanitizeLocation = <T extends { readonly url: string; readonly title?: string }>(location: T): T => ({
    ...location,
    url: transform(location.url, 'url', location.url),
    ...(location.title === undefined ? {} : { title: transform(location.title, 'title', location.url) }),
  });
  const sanitizeTarget = (target: TargetElementMeta, sourceUrl: string): TargetElementMeta => {
    const result = { ...target };
    for (const field of ['id', 'className', 'name', 'selector'] as const) {
      if (result[field] !== undefined) result[field] = transform(result[field]!, 'identifier', sourceUrl);
    }
    for (const field of ['ariaLabel', 'textSnippet'] as const) {
      if (result[field] !== undefined) result[field] = transform(result[field]!, 'text', sourceUrl);
    }
    if (result.href !== undefined) result.href = transform(result.href, 'link', sourceUrl);
    return result;
  };
  const sanitizeCapture = (capture: MilestoneCapture): MilestoneCapture => ({
    ...capture,
    url: transform(capture.url, 'url', capture.url),
    detail: transform(capture.detail, 'text', capture.url),
    ...(capture.domTarget ? { domTarget: sanitizeTarget(capture.domTarget, capture.url) } : {}),
    ...(capture.scrollEpisode ? { scrollEpisode: {
      ...capture.scrollEpisode,
      cause: {
        ...capture.scrollEpisode.cause,
        ...(capture.scrollEpisode.cause.detail === undefined ? {} : {
          detail: transform(capture.scrollEpisode.cause.detail,
            capture.scrollEpisode.cause.kind === 'link' ? 'link' : 'text', capture.url),
        }),
      },
    } } : {}),
  });
  return {
    wrapHost<Tab>(host: TabHost<Tab>): TabHost<Tab> { return privacyHost(host, program, report); },
    wrapCaptureSink(sink: CaptureSink): CaptureSink {
      return { name: sink.name, enqueue: (capture) => sink.enqueue(sanitizeCapture(capture)), drain: () => sink.drain() };
    },
    wrapClipSink(sink: ClipSink): ClipSink {
      return { name: sink.name, enqueue: (write) => sink.enqueue(write.type === 'keep'
        ? { ...write, capture: sanitizeCapture(write.capture) } : write), drain: () => sink.drain() };
    },
    sanitizeLocation,
  };
}
