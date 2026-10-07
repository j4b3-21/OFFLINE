export class TinyLlamaEngine {
  async initialize(): Promise<void> {
    throw new Error('On-device inference requires an iOS or Android development build.');
  }
  isReady() {
    return false;
  }
  async generate(): Promise<string> {
    throw new Error('On-device inference is unavailable on web.');
  }
  async dispose() {}
}
