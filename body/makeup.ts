// A clay body's physical makeup from its lines' traits: plastic clays + plasticizers vs
// non-plastics, added silica share, and any unclassified custom materials.

import { labelOf } from '../identity.ts';
import { traitsOf } from '../traits.ts';
import type { MaterialClass } from '../traits.ts';
import type { Readers } from '../host.ts';
import { amountOf } from '../recipe/amounts.ts';
import type { Amount } from '../recipe/amounts.ts';

const PLASTIC_CLASSES: readonly MaterialClass[] = Object.freeze([
  'ball clay',
  'kaolin',
  'fire clay',
  'stoneware clay',
  'earthenware clay',
  'plasticizer'
]);

/** Whether a material class counts toward the plastic share of a clay body. */
function isPlasticClass(materialClass: MaterialClass | undefined): boolean {
  return Boolean(materialClass && PLASTIC_CLASSES.includes(materialClass));
}

/** What a material contributes physically to a body: plastic clay, added silica, or another non-plastic. */
export type BodyPart = 'plastic' | 'silica' | 'other';

/**
 * Classifies a material record as `'plastic'`, `'silica'`, `'other'`, or `null` when the host marks
 * it `unclassified` (a potter's own material with no class assigned). Calcined clays (molochite,
 * calcined kaolin) are non-plastic (`'other'`).
 */
function bodyPart(host: Readers, record: { category?: string } | null | undefined): BodyPart | null {
  const traits = traitsOf(host, record);
  if (traits.unclassified) return null;
  if (traits.calcined) return 'other';
  if (traits.materialClass) {
    if (isPlasticClass(traits.materialClass)) return 'plastic';
    return traits.materialClass === 'silica' ? 'silica' : 'other';
  }
  if (traits.plasticizer || traits.kaolin || traits.kaolinOrBallClay || record?.category === 'clay') return 'plastic';
  if (traits.defaultSilica || record?.category === 'silica') return 'silica';
  return 'other';
}

/** Physical shares of a clay body, as percentages of total dry batch weight. */
export interface BodyMakeup {
  plastic: number;
  nonPlastic: number;
  plasticizer: number;
  silica: number;
  /** Labels (labelOf) of unclassified records, counted as non-plastic. */
  unknown: unknown[];
}

export interface MakeupLine {
  material?: { category?: string } | null;
  amount?: Amount;
}

/**
 * Sums a body's plastic, non-plastic, swelling plasticizer and added silica percentages across all
 * lines with positive amounts. Null when total weight is not positive.
 */
function bodyMakeup(host: Readers, lines: ReadonlyArray<MakeupLine>): BodyMakeup | null {
  const usable = (lines ?? [])
    .map((line) => ({ material: line.material, weight: amountOf(line.amount) }))
    .filter((line) => Number.isFinite(line.weight) && line.weight > 0);
  const total = usable.reduce((sum, line) => sum + line.weight, 0);
  if (!(total > 0)) return null;

  let plastic = 0;
  let plasticizer = 0;
  let silica = 0;
  const unknown: unknown[] = [];

  for (const { material, weight } of usable) {
    const share = (100 * weight) / total;
    const traits = traitsOf(host, material);
    if (!traits.calcined && (traits.plasticizer || traits.materialClass === 'plasticizer')) {
      plasticizer += share;
    }
    const part = bodyPart(host, material);
    if (part === 'plastic') plastic += share;
    else if (part === 'silica') silica += share;
    else if (part === null) {
      const label = labelOf(host, material);
      if (label !== undefined && !unknown.includes(label)) unknown.push(label);
    }
  }

  return { plastic, nonPlastic: 100 - plastic, plasticizer, silica, unknown };
}

export { PLASTIC_CLASSES, isPlasticClass, bodyPart, bodyMakeup };
