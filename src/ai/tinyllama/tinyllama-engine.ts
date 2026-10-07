import { initLlama, type LlamaContext } from 'llama.rn';

import { integrationConfig } from '@/config/integrations';
import { localModelManager } from '@/ai/tinyllama/tinyllama-model-manager';

export type GenerationOptions = { temperature?: number; maxTokens?: number };

export class TinyLlamaEngine {
  private context?: LlamaContext;
  private ready = false;

  async initialize() {
    if (this.ready) return;
    const modelPath = await localModelManager.getModelPath();
    try {
      this.context = await initLlama({
        model: modelPath.startsWith('file://') ? modelPath : `file://${modelPath}`,
        use_mmap: true,
        use_mlock: false,
        n_ctx: integrationConfig.model.contextLength,
        n_gpu_layers: 99,
      });
      this.ready = true;
    } catch (error) {
      await this.dispose();
      throw new Error(`The on-device model could not initialize: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  isReady() {
    return this.ready;
  }

  async generate(prompt: string, options: GenerationOptions = {}) {
    if (!this.context) throw new Error('The on-device model is not ready.');
    const result = await this.context.completion({
      prompt,
      n_predict: options.maxTokens ?? integrationConfig.model.maxTokens,
      temperature: options.temperature ?? integrationConfig.model.temperature,
      stop: ['</s>', '<|end|>', '<|eot_id|>'],
    });
    return result.text.trim();
  }

  async dispose() {
    await this.context?.release();
    this.context = undefined;
    this.ready = false;
  }
}
