export class LocalModelManager {
  isDownloaded() {
    return Promise.resolve(false);
  }

  async download(): Promise<never> {
    throw new Error('TinyLlama downloads are unavailable on web.');
  }

  async getModelPath(): Promise<null> {
    throw new Error('TinyLlama downloads are unavailable on web.');
  }
}

export const localModelManager = new LocalModelManager();
