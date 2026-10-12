import { describe, expect, it } from 'vitest';
import { decodeDiagnostic } from '../src/decode.js';

const program = { id: 'demo.v1', rules: [{ id: 'name', selector: '#name', replacement: 'Don Joe' }] };
const rule = { type: 'rule', programId: program.id, ruleId: 'name', status: 'overwritten', level: 'info', matched: 1, overwritten: 1 };

describe('privacy diagnostics', () => {
  it('never forwards arbitrary fields from the page', () => {
    expect(decodeDiagnostic(JSON.stringify({ ...rule, original: 'Synthetic original' }), program)).toEqual(rule);
  });
  it('derives the profile ID and warning level from trusted configuration and the status', () => {
    const compiled = { ...program, profileId: 'synthetic' };
    expect(decodeDiagnostic(JSON.stringify({ ...rule, profileId: 'private page data', status: 'ambiguous', level: 'info' }), compiled))
      .toEqual({ ...rule, profileId: 'synthetic', status: 'ambiguous', level: 'warning' });
  });
  it.each([
    null, [], {}, { ...rule, ruleId: 'unknown' }, { ...rule, status: 'unknown' },
    { ...rule, matched: 0.5 }, { ...rule, overwritten: 2 }, { ...rule, programId: 'unknown' },
  ])('rejects unsupported payload %j', (payload) => {
    expect(decodeDiagnostic(JSON.stringify(payload), program)).toBeNull();
  });
});
