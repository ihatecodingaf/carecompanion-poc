export type HairShotType = 'crown' | 'scalp' | 'hairline';
export type CaptureMode = 'face' | 'hair';

export interface ConditionConfig {
  captureMode: CaptureMode;
  shotTypes?: HairShotType[];
}

export const CONDITION_CONFIG: Record<string, ConditionConfig> = {
  // Face-only
  acne_vulgaris:            { captureMode: 'face' },
  acne:                     { captureMode: 'face' },
  laser_recovery:           { captureMode: 'face' },

  // Hair — crown + hairline + scalp (hairline recession is primary marker)
  androgenic_alopecia:      { captureMode: 'hair', shotTypes: ['crown', 'hairline', 'scalp'] },
  prp_hair:                 { captureMode: 'hair', shotTypes: ['crown', 'hairline', 'scalp'] },
  post_hair_transplant_fue: { captureMode: 'hair', shotTypes: ['crown', 'hairline', 'scalp'] },
  post_hair_transplant_fut: { captureMode: 'hair', shotTypes: ['crown', 'hairline', 'scalp'] },

  // Hair — crown + scalp only (patches appear anywhere, hairline less diagnostic)
  alopecia_areata:          { captureMode: 'hair', shotTypes: ['crown', 'scalp'] },
  telogen_effluvium:        { captureMode: 'hair', shotTypes: ['crown', 'scalp'] },

  // Hairline only — for patients where recession at the front is the primary focus
  hairline_monitoring:      { captureMode: 'hair', shotTypes: ['hairline'] },
};

export const ALOPECIA_CONDITIONS = new Set([
  'androgenic_alopecia',
  'alopecia_areata',
  'telogen_effluvium',
  'post_hair_transplant_fue',
  'post_hair_transplant_fut',
  'prp_hair',
]);

export function getConditionConfig(condition: string | undefined): ConditionConfig {
  if (!condition) return { captureMode: 'face' };
  return CONDITION_CONFIG[condition] ?? { captureMode: 'face' };
}
