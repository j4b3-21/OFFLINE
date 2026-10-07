import { integrationConfig } from '@/config/integrations';
import { localModel, type LocalModel } from '@/ai/local-model';
import { MockModel } from '@/ai/mock/mock-model';

const mockModel = new MockModel();

/**
 * The single model the app runs with, selected by `integrationConfig.ai.provider`.
 * The experience engine, walking monitor, and UI all consume this binding, so
 * switching planners never touches domain code.
 */
export const activeModel: LocalModel =
  integrationConfig.ai.provider === 'tinyllama' ? localModel : mockModel;

/** True only when the one-time on-device model download must happen first. */
export const modelSetupRequired = integrationConfig.ai.provider === 'tinyllama';
