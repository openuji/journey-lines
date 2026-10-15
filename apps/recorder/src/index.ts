export * from './session.js';

export type { CaptureSink, MilestoneCapture } from '@journey-lines/core';
export { ConsoleSink, PersistenceSink } from '@journey-lines/sinks';
export { defaultRules, startRecording } from '@journey-lines/fused';
export type { RecordingHandle, RecordingOptions } from '@journey-lines/fused';
export { defaultDocumentRules } from '@journey-lines/rules-document';
export { defaultInteractionRules } from '@journey-lines/rules-interaction';
