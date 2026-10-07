import type { ExperiencePlan, NavigationInstruction, Route } from '@/domain/experience';

export type SafetyResult = {
  safe: boolean;
  reasons: string[];
};

export const safetyEngine = {
  validateExperience(experience: ExperiencePlan): SafetyResult {
    const reasons: string[] = [];
    if (!experience.offline) reasons.push('Experience is not offline-capable.');
    if (!experience.safety.avoidRoadCrossings) reasons.push('Route crossing constraints are missing.');
    if (!experience.safety.emergencyOverrideAvailable) reasons.push('Emergency override is unavailable.');
    return { safe: reasons.length === 0, reasons };
  },

  validateRoute(route: Route): SafetyResult {
    const reasons: string[] = [];
    if (route.points.length < 2) reasons.push('Route has no usable geometry.');
    if (route.points.some((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))) {
      reasons.push('Route contains invalid coordinates.');
    }
    return { safe: reasons.length === 0, reasons };
  },

  validateNavigationInstruction(instruction: NavigationInstruction): SafetyResult {
    const reasons = instruction.text.trim().length === 0 ? ['Instruction is empty.'] : [];
    return { safe: reasons.length === 0, reasons };
  },

  shouldOverride(offRoute: boolean, accuracyMeters?: number) {
    return offRoute && (accuracyMeters === undefined || accuracyMeters > 100);
  },
};
