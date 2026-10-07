import { localModel, type LocalModel } from '@/ai/local-model';
import { validateExperiencePlan, type ExperiencePlan, type Location, type WalkMode } from '@/domain/experience';

export class ExperienceEngine {
  constructor(private readonly model: LocalModel = localModel) {}

  /**
   * Plan-variant inputs are optional trailing params so the existing signature
   * stays compatible. `walkMode` and `hourOfDay` are decided at generation
   * time and forwarded on the ModelRequest; the planner defaults ('quiet' and
   * midday) when they are absent, so a plan never depends on the wall clock at
   * cue time.
   */
  async create(
    durationMinutes: number,
    startLocation?: Pick<Location, 'latitude' | 'longitude'>,
    routeSeed = Math.floor(Math.random() * 2_147_483_647),
    walkMode?: WalkMode,
    hourOfDay?: number,
  ): Promise<ExperiencePlan> {
    try {
      await this.model.load();
      const response = await this.model.generate({
        task: 'experience-plan',
        durationMinutes,
        startLocation,
        routeSeed,
        walkMode,
        hourOfDay,
      });
      return validateExperiencePlan(response.plan);
    } finally {
      if (this.model.isLoaded()) await this.model.unload();
    }
  }

  modelName() {
    return this.model.metadata().displayName;
  }
}
