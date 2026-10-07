import { describe, expect, it } from 'vitest';

import type { LocalModel, ModelRequest, ModelResponse } from '@/ai/local-model';

class RouteSeedTestModel implements LocalModel {
  private loaded = false;

  async load() {
    this.loaded = true;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const direction = (request.routeSeed ?? 1) % 2 === 0 ? 1 : -1;
    return {
      plan: {
        id: `test-${request.routeSeed}`,
        schemaVersion: 'experience.schema.v1',
        durationMinutes: 30,
        route: {
          id: `route-${request.routeSeed}`,
          summary: 'Test route',
          points: [
            { latitude: 12.9716, longitude: 77.5946 },
            { latitude: 12.9726, longitude: 77.5946 + direction * 0.001 },
          ],
          distanceKm: 0.2,
          durationMinutes: 30,
          instructions: ['Follow the test route.'],
        },
        landmarks: [],
        missions: [{ id: 'mission', prompt: 'Notice something nearby.', estimatedMinutes: 5 }],
        attentionBudget: { maxScreenInteractions: 1, maxScreenSeconds: 10, maxAIInteractions: 1 },
        safety: { avoidRoadCrossings: true, daylightRequired: true, emergencyOverrideAvailable: true },
        offline: true,
        createdAt: new Date().toISOString(),
        routeSeed: request.routeSeed,
      },
    };
  }

  async *stream(request: ModelRequest) {
    yield JSON.stringify(await this.generate(request));
  }

  async unload() {
    this.loaded = false;
  }

  isLoaded() {
    return this.loaded;
  }

  async health() {
    return this.loaded ? { status: 'ready' as const } : { status: 'unavailable' as const };
  }

  metadata() {
    return { id: 'route-seed-test', displayName: 'Route seed test model', local: true };
  }
}

describe('route seeds', () => {
  it('select different valid route geometry for different seeds', async () => {
    const model = new RouteSeedTestModel();
    await model.load();
    const first = await model.generate({ task: 'experience-plan', durationMinutes: 30, routeSeed: 1 });
    const second = await model.generate({ task: 'experience-plan', durationMinutes: 30, routeSeed: 2 });
    expect(first.plan).not.toEqual(second.plan);
  });
});
