export type ModelConfig = {
  modelId: string;
  version: string;
  modelUrl: string;
  filename: string;
  sizeBytes: number;
  contextLength: number;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
};

export type VoiceConfig = {
  enabled: boolean;
  language: string;
  rate: number;
  pitch: number;
  volume: number;
};

export type AiProvider = 'mock' | 'tinyllama';

export type IntegrationConfig = {
  ai: { provider: AiProvider };
  model: ModelConfig;
  voice: VoiceConfig;
  music: { enabled: boolean };
};

export const integrationConfig: IntegrationConfig = {
  // 'mock' runs the deterministic offline planner (no download, no inference).
  // 'tinyllama' enables the on-device TinyLlama path, including its one-time
  // model download in the UI.
  ai: { provider: 'mock' },
  model: {
    modelId: 'tinyllama-1.1b-chat-v1.0',
    version: '1.0',
    modelUrl:
      'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/52e7645ba7c309695bec7ac98f4f005b139cf465/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf?download=true',
    filename: 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    sizeBytes: 668_788_096,
    contextLength: 2048,
    temperature: 0.35,
    maxTokens: 128,
    timeoutMs: 20_000,
  },
  voice: {
    enabled: true,
    language: 'en-US',
    rate: 0.5,
    pitch: 1,
    volume: 1,
  },
  music: { enabled: true },
};
