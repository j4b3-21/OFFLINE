import type { VoiceCue, VoiceProvider } from '@/voice/voice-provider';

export class VoiceQueue {
  private current?: Promise<void>;
  private stopped = false;

  constructor(private readonly provider: VoiceProvider) {}

  enqueue(cue: VoiceCue) {
    this.stopped = false;
    const speak = async () => {
      const prepared = await this.provider.synthesize(cue);
      await this.provider.play(prepared);
    };
    this.current = this.current?.catch(() => undefined).then(speak) ?? speak();
    return this.current;
  }

  async stop() {
    this.stopped = true;
    await this.provider.stop();
    this.current = undefined;
  }
}

export class QueuedVoiceProvider {
  private readonly queue: VoiceQueue;

  constructor(private readonly provider: VoiceProvider) {
    this.queue = new VoiceQueue(provider);
  }

  play(cue: VoiceCue) {
    return this.queue.enqueue(cue);
  }

  stop() {
    return this.queue.stop();
  }

  isAvailable() {
    return this.provider.isAvailable();
  }
}
