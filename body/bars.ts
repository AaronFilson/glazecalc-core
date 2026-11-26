// Test-bar calculations: SHAB drying/firing/total linear shrinkage and boil absorption,
// ASTM C373 apparent porosity and bulk density from suspended weight, and pyroplastic deformation.

export interface BarInput {
  mark?: unknown;
  dry?: unknown;
  fired?: unknown;
  firedWeight?: unknown;
  soakedWeight?: unknown;
  suspendedWeight?: unknown;
  span?: unknown;
  bow?: unknown;
  sag?: unknown;
}

export interface BarResults {
  /** Wet-to-dry linear shrinkage, % of wet mark spacing. */
  dryingShrinkage?: number;
  /** Dry-to-fired linear shrinkage, % of dry spacing. */
  firingShrinkage?: number;
  /** Wet-to-fired linear shrinkage, % of wet mark spacing. */
  totalShrinkage?: number;
  /** Water absorbed on boiling/soaking, % of fired dry weight. */
  absorption?: number;
  /** Apparent open porosity (ASTM C373), % of exterior volume. */
  porosity?: number;
  /** Bulk density (ASTM C373), g/cm³. */
  density?: number;
  /** Pyroplastic deformation (dry bow + fired sag), mm. */
  deformation?: number;
}

const parsedNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const positive = (value: unknown): number | undefined => {
  const n = parsedNumber(value);
  return n !== null && n > 0 ? n : undefined;
};

/** Derives all supported shrinkages, absorption, porosity, bulk density and sag from bar measurements. */
function barResults(bar: BarInput | null | undefined): BarResults {
  if (!bar) return {};
  const mark = positive(bar.mark);
  const dry = positive(bar.dry);
  const fired = positive(bar.fired);
  const weight = positive(bar.firedWeight);
  const soaked = positive(bar.soakedWeight);
  const suspended = positive(bar.suspendedWeight);

  const results: BarResults = {};
  if (mark && dry) results.dryingShrinkage = ((mark - dry) / mark) * 100;
  if (dry && fired) results.firingShrinkage = ((dry - fired) / dry) * 100;
  if (mark && fired) results.totalShrinkage = ((mark - fired) / mark) * 100;
  if (weight && soaked && soaked >= weight) results.absorption = ((soaked - weight) / weight) * 100;
  if (weight && soaked && suspended && soaked > suspended && soaked >= weight) {
    results.porosity = ((soaked - weight) / (soaked - suspended)) * 100;
    results.density = weight / (soaked - suspended);
  }
  const bow = parsedNumber(bar.bow);
  const sag = parsedNumber(bar.sag);
  if (sag !== null && sag >= 0) results.deformation = sag + (bow !== null && bow >= 0 ? bow : 0);
  return results;
}

export { barResults };
