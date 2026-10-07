import { localModel, type LocalModel } from '@/ai/local-model';
import { validateExperiencePlan, type ExperiencePlan, type Location } from '@/domain/experience';

export class ExperienceEngine {
  constructor(private readonly model: LocalModel = localModel) {}

  async create(
    durationMinutes: number,
    startLocation?: Pick<Location, 'latitude' | 'longitude'>,
    routeSeed = Math.floor(Math.random() * 2_147_483_647),
  ): Promise<ExperiencePlan> {
    try {
      await this.model.load();
      const response = await this.model.generate({
        task: 'experience-plan',
        durationMinutes,
        startLocation,
        routeSeed,
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
