import type { Location, WalkMode } from '@/domain/experience';
import { integrationConfig, type ModelConfig } from '@/config/integrations';
import { TinyLlamaEngine } from '@/ai/tinyllama/tinyllama-engine';
import { walkingPrompt, experiencePrompt } from '@/ai/prompts';

export type ModelRequest = {
  task?: 'experience-plan' | 'walking-cue';
  durationMinutes?: number;
  context?: string;
  startLocation?: Pick<Location, 'latitude' | 'longitude'>;
  walkingState?: WalkingState;
  routeSeed?: number;
  /** Optional plan-variant inputs; the planner defaults when absent. */
  walkMode?: WalkMode;
  hourOfDay?: number;
};

export type ModelMetadata = { id: string; displayName: string; local: boolean };
export type ModelResponse = { plan?: unknown; cue?: string };
export type MovementState = 'moving' | 'slow' | 'stationary';
export type WalkingState = {
  currentLocation: Pick<Location, 'latitude' | 'longitude'>;
  previousLocation: Pick<Location, 'latitude' | 'longitude'>;
  distanceMovedMeters: number;
  elapsedSeconds: number;
  movementState: MovementState;
  recentCueHistory: string[];
  routeSeed: number;
  /** Optional plan context so the cue generator can reference the active walk. */
  landmarkAhead?: { title: string; description: string };
  mission?: { prompt: string };
};
export type ModelHealth = {
  status: 'unavailable' | 'loading' | 'ready' | 'error';
  reason?: string;
};

export interface LocalModel {
  load(): Promise<void>;
  generate(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest): AsyncIterable<string>;
  unload(): Promise<void>;
  metadata(): ModelMetadata;
  isLoaded(): boolean;
  health(): Promise<ModelHealth>;
}

export class TinyLlamaAdapter implements LocalModel {
  private state: ModelHealth = { status: 'unavailable', reason: 'Model is not initialized.' };

  constructor(
    private readonly config: ModelConfig,
    private readonly engine = new TinyLlamaEngine(),
  ) {}

  async load() {
    this.state = { status: 'loading' };
    try {
      await this.engine.initialize();
      this.state = { status: 'ready' };
    } catch (error) {
      this.state = { status: 'error', reason: error instanceof Error ? error.message : 'Model initialization failed.' };
      throw error;
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    if (!this.engine.isReady()) await this.load();
    const prompt = request.task === 'walking-cue'
      ? walkingPrompt(request.walkingState!)
      : experiencePrompt(request.durationMinutes ?? 30, request.startLocation, request.routeSeed ?? 0);
    const text = await this.engine.generate(prompt, {
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });
    return request.task === 'walking-cue' ? { cue: text } : { plan: parseModelJson(text) };
  }

  async *stream(request: ModelRequest): AsyncIterable<string> {
    yield JSON.stringify(await this.generate(request));
  }

  async unload() {
    await this.engine.dispose();
    this.state = { status: 'unavailable', reason: 'Model is unloaded.' };
  }

  metadata() {
    return { id: this.config.modelId, displayName: 'TinyLlama 1.1B (Q4_K_M)', local: true };
  }

  isLoaded() {
    return this.state.status === 'ready';
  }

  async health() {
    return this.state;
  }
}

export const localModel = new TinyLlamaAdapter(integrationConfig.model);

function parseModelJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text;
  try {
    return JSON.parse(fenced.trim());
  } catch {
    throw new Error('The local model returned invalid experience JSON.');
  }
}
