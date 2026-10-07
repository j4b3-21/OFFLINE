import * as FileSystem from 'expo-file-system/legacy';

import { integrationConfig } from '@/config/integrations';

export type ModelDownloadProgress = {
  downloadedBytes: number;
  totalBytes: number;
  fraction: number;
};

export class LocalModelManager {
  private downloadTask?: FileSystem.DownloadResumable;

  private get modelPath() {
    return `${FileSystem.documentDirectory}${integrationConfig.model.filename}`;
  }

  isDownloaded() {
    return FileSystem.getInfoAsync(this.modelPath).then(
      (info) => info.exists && info.size === integrationConfig.model.sizeBytes,
    );
  }

  async download(onProgress?: (progress: ModelDownloadProgress) => void) {
    if (await this.isDownloaded()) return this.modelPath;
    if (this.downloadTask) throw new Error('The TinyLlama download is already in progress.');

    const temporaryPath = `${this.modelPath}.download`;
    await FileSystem.deleteAsync(temporaryPath, { idempotent: true });
    this.downloadTask = FileSystem.createDownloadResumable(
      integrationConfig.model.modelUrl,
      temporaryPath,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        onProgress?.({
          downloadedBytes: totalBytesWritten,
          totalBytes: totalBytesExpectedToWrite,
          fraction: totalBytesExpectedToWrite > 0 ? totalBytesWritten / totalBytesExpectedToWrite : 0,
        });
      },
    );

    try {
      await this.downloadTask.downloadAsync();
      const info = await FileSystem.getInfoAsync(temporaryPath);
      if (!info.exists || info.size !== integrationConfig.model.sizeBytes) {
        throw new Error('The downloaded TinyLlama file is incomplete.');
      }
      await FileSystem.moveAsync({ from: temporaryPath, to: this.modelPath });
      return this.modelPath;
    } finally {
      this.downloadTask = undefined;
    }
  }

  async cancelDownload() {
    if (!this.downloadTask) return;
    await this.downloadTask.pauseAsync();
    await FileSystem.deleteAsync(`${this.modelPath}.download`, { idempotent: true });
    this.downloadTask = undefined;
  }

  async getModelPath(): Promise<string> {
    if (!(await this.isDownloaded())) {
      throw new Error('Download TinyLlama before using local AI.');
    }
    return this.modelPath;
  }
}

export const localModelManager = new LocalModelManager();
