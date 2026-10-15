import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { MilestoneCapture } from '@journey-lines/core';
import { compilePrivacy, createPrivacy, privacyProfileFromDocument } from '@journey-lines/privacy';
import { captureCases, locationCases } from './fixtures/privacy/metadata-cases.js';

const settingsUrl = new URL('../settings.defaults.json', import.meta.url);
const settings = JSON.parse(readFileSync(settingsUrl, 'utf8')) as { privacy: { profilePath: string } };
const configuredDocument = JSON.parse(readFileSync(new URL(settings.privacy.profilePath, settingsUrl), 'utf8'));
const fixtureDocument = JSON.parse(readFileSync(new URL('./fixtures/privacy/metadata-profile.jsonld', import.meta.url), 'utf8'));
const fixtureProfile = privacyProfileFromDocument(fixtureDocument);

describe('privacy profile fixtures', () => {
  it('compiles the current profile selected by extension settings', () => {
    expect(compilePrivacy(privacyProfileFromDocument(configuredDocument))).toBeDefined();
  });

  it.each(locationCases)('sanitizes location fixture $input.url', ({ input, expected }) => {
    const privacy = createPrivacy(fixtureProfile);
    const before = JSON.stringify(input);
    expect(privacy.sanitizeLocation(input)).toEqual(expected);
    expect(privacy.sanitizeLocation(expected)).toEqual(expected);
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each(captureCases)('sanitizes capture and clip fixture $input.url', async ({ input, expected, privateValues }) => {
    const privacy = createPrivacy(fixtureProfile);
    const before = JSON.stringify(input);
    const captures = { name: 'captures', enqueue: vi.fn(), drain: vi.fn(async () => {}) };
    const clips = { name: 'clips', enqueue: vi.fn(), drain: vi.fn(async () => {}) };
    const captureSink = privacy.wrapCaptureSink(captures);
    const clipSink = privacy.wrapClipSink(clips);

    captureSink.enqueue(input);
    clipSink.enqueue({ type: 'frame', id: 'clip-1', frame: input.frame, position: null });
    clipSink.enqueue({ type: 'keep', id: 'clip-1', capture: input });
    clipSink.enqueue({ type: 'drop', id: 'clip-2' });
    await Promise.all([captureSink.drain(), clipSink.drain()]);

    const output = captures.enqueue.mock.calls[0]![0] as MilestoneCapture;
    expect(output).toEqual(expected);
    for (const value of privateValues) expect(JSON.stringify(output)).not.toContain(value);
    expect(output.frame).toBe(input.frame);
    expect(clips.enqueue.mock.calls[0]![0]).toEqual({ type: 'frame', id: 'clip-1', frame: input.frame, position: null });
    expect(clips.enqueue.mock.calls[1]![0]).toEqual({ type: 'keep', id: 'clip-1', capture: expected });
    expect(clips.enqueue.mock.calls[2]![0]).toEqual({ type: 'drop', id: 'clip-2' });
    expect(JSON.stringify(input)).toBe(before);
    expect(captures.drain).toHaveBeenCalledTimes(1);
    expect(clips.drain).toHaveBeenCalledTimes(1);
  });
});
