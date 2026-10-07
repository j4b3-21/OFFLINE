import { describe, expect, it } from 'vitest';

import { shouldInterruptMusic, shouldSuppressCue } from '@/interaction/audio-priority';

const cue = {
  id: 'cue',
  text: 'Continue.',
  provider: 'system' as const,
  voicePreset: 'system',
};

describe('audio priority', () => {
  it('lets navigation interrupt music but suppresses ambient cues', () => {
    expect(shouldInterruptMusic({ priority: 'navigation', cue }, true)).toBe(true);
    expect(shouldSuppressCue({ priority: 'ambient', cue }, true)).toBe(true);
  });

  it('never suppresses safety cues', () => {
    expect(shouldInterruptMusic({ priority: 'safety', cue }, true)).toBe(true);
    expect(shouldSuppressCue({ priority: 'safety', cue }, true)).toBe(false);
  });
});
