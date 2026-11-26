// Side-by-side comparison of materials by their data sheets (shrinkage, absorption, plasticity,
// particle size, dry strength, density) and by their raw-basis oxide analyses + LOI.

import type { Host } from '../host.ts';
import type { DataSheet, FiredReading, MaterialInput, Oxides } from '../types.ts';

const COMPARED_SHEET_FIELDS = [
  'dryingShrinkage',
  'firingShrinkage',
  'totalShrinkage',
  'absorption',
  'waterOfPlasticity',
  'finer1um',
  'finer2um',
  'mesh',
  'dryStrength',
  'density'
] as const;

export type SheetFieldKey = (typeof COMPARED_SHEET_FIELDS)[number];

const FIRED_SHEET_FIELDS: readonly SheetFieldKey[] = Object.freeze(['firingShrinkage', 'totalShrinkage', 'absorption']);
const WORD_SHEET_FIELDS: readonly SheetFieldKey[] = Object.freeze(['mesh', 'dryStrength']);

export interface ComparedSheetRow {
  field: SheetFieldKey;
  /** Each material's string value, '' where absent. */
  values: string[];
  /** Numeric difference `value - first`, null for index 0, text fields or missing numbers. */
  deltas: Array<number | null>;
  fired: boolean;
}

export interface ComparedOxideRow {
  oxide: string;
  values: Array<number | null>;
  deltas: Array<number | null>;
}

const textOf = (value: unknown): string => (value === undefined || value === null ? '' : String(value).trim());

const numOf = (text: string): number | null => {
  if (!text) return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const pickFired = (readings: readonly FiredReading[] | undefined, preferredCone?: string): FiredReading | undefined => {
  if (!readings?.length) return undefined;
  if (preferredCone) {
    const clean = preferredCone.trim().toLowerCase().replace(/^\^/, '');
    const match = readings.find((r) => r.cone?.trim().toLowerCase().replace(/^\^/, '') === clean);
    if (match) return match;
  }
  return readings[readings.length - 1];
};

/**
 * Resolves a data sheet's top-level fields, filling `cone`, `firingShrinkage`, `totalShrinkage` and
 * `absorption` from `sheet.fired` (matching `preferredCone` or the highest-fired entry) when not set directly.
 */
function effectiveSheet(sheet: DataSheet | undefined, preferredCone?: string): DataSheet | undefined {
  if (!sheet) return undefined;
  const picked = pickFired(sheet.fired, preferredCone);
  if (!picked) return sheet;
  return {
    ...sheet,
    cone: sheet.cone ?? picked.cone ?? (picked.celsius !== undefined ? `${picked.celsius} °C` : undefined),
    firingShrinkage: sheet.firingShrinkage ?? picked.firingShrinkage,
    totalShrinkage: sheet.totalShrinkage ?? picked.totalShrinkage,
    absorption: sheet.absorption ?? picked.absorption
  };
}

/** Compares data sheets row by row, omitting fields that no material has. */
function compareSheets(records: ReadonlyArray<{ sheet?: DataSheet }>, preferredCone?: string): ComparedSheetRow[] {
  const sheets = (records ?? []).map((r) => effectiveSheet(r?.sheet, preferredCone));
  return COMPARED_SHEET_FIELDS.map((field): ComparedSheetRow => {
    const values = sheets.map((s) => textOf(s?.[field]));
    const first = numOf(values[0] ?? '');
    const deltas = values.map((v, i) => {
      if (i === 0 || WORD_SHEET_FIELDS.includes(field) || first === null) return null;
      const n = numOf(v);
      return n === null ? null : n - first;
    });
    return { field, values, deltas, fired: FIRED_SHEET_FIELDS.includes(field) };
  }).filter((row) => row.values.some(Boolean));
}

/** Each material's sheet cone, and whether sheets with fired properties report them at different cones. */
function sheetCones(
  records: ReadonlyArray<{ sheet?: DataSheet }>,
  preferredCone?: string
): { cones: string[]; differ: boolean } {
  const sheets = (records ?? []).map((r) => effectiveSheet(r?.sheet, preferredCone));
  const cones = sheets.map((s) => textOf(s?.cone).replace(/^\^/, ''));
  const active = sheets
    .map((s, i) => ({
      cone: cones[i]!.toLowerCase(),
      has: FIRED_SHEET_FIELDS.some((field) => Boolean(textOf(s?.[field])))
    }))
    .filter((entry) => entry.has);
  return { cones, differ: new Set(active.map((entry) => entry.cone)).size > 1 };
}

/**
 * Raw-basis oxide weight percents and LOI of a material record (from `formula`, `analysis`, or
 * stored `fields` + `percentmole` + `loi`). Null when the record gives neither oxides nor LOI.
 */
function rawAnalysis(
  host: Pick<Host, 'oxides'>,
  material: MaterialInput | null | undefined
): { oxides: Oxides; loi: number } | null {
  if (!material) return null;
  const out: Oxides = {};
  let loi = 0;

  if (material.formula) {
    const weighed = Object.entries(material.formula)
      .map(([compound, moles]) => ({
        compound,
        weight: Number(moles) * (host.oxides.molarMass[compound] ?? NaN)
      }))
      .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
    const total = weighed.reduce((sum, entry) => sum + entry.weight, 0);
    if (!(total > 0)) return null;
    for (const { compound, weight } of weighed) {
      const pct = (weight / total) * 100;
      if (Object.hasOwn(host.oxides.groups, compound)) out[compound] = (out[compound] ?? 0) + pct;
      else loi += pct;
    }
  } else if (material.analysis) {
    for (const [oxide, val] of Object.entries(material.analysis)) {
      const pct = numOf(textOf(val));
      if (pct !== null && pct > 0 && Object.hasOwn(host.oxides.groups, oxide)) {
        out[oxide] = (out[oxide] ?? 0) + pct;
      }
    }
    loi = numOf(textOf(material.loi)) ?? 0;
  } else if (Array.isArray(material.fields)) {
    const mode = textOf(material.percentmole).toLowerCase();
    const storedLoi = numOf(textOf(material.loi));
    if (mode === 'percent') {
      for (const field of material.fields) {
        const pct = numOf(textOf(field.amount));
        if (pct !== null && pct > 0 && Object.hasOwn(host.oxides.groups, field.name)) {
          out[field.name] = (out[field.name] ?? 0) + pct;
        }
      }
      loi = storedLoi ?? 0;
    } else {
      const weighed = material.fields
        .map((field) => ({
          oxide: field.name,
          weight: (numOf(textOf(field.amount)) ?? NaN) * (host.oxides.molarMass[field.name] ?? NaN)
        }))
        .filter(
          (entry) => Number.isFinite(entry.weight) && entry.weight > 0 && Object.hasOwn(host.oxides.groups, entry.oxide)
        );
      const firedWeight = weighed.reduce((sum, entry) => sum + entry.weight, 0);
      if (!(firedWeight > 0)) return null;
      const mw = numOf(textOf(material.molecularweight));
      const impliedLoi = mw !== null && mw > firedWeight ? (1 - firedWeight / mw) * 100 : 0;
      loi = storedLoi !== null && storedLoi >= 0 && storedLoi < 100 ? storedLoi : impliedLoi;
      for (const { oxide, weight } of weighed) {
        out[oxide] = (out[oxide] ?? 0) + (weight / firedWeight) * (100 - loi);
      }
    }
  }

  return Object.keys(out).length > 0 || loi > 0 ? { oxides: out, loi } : null;
}

/** Side-by-side raw-basis oxide wt% rows (in host oxide order) followed by `'LOI'` when present. */
function compareAnalyses(
  host: Pick<Host, 'oxides'>,
  records: ReadonlyArray<MaterialInput | null | undefined>
): ComparedOxideRow[] {
  const parsed = (records ?? []).map((r) => rawAnalysis(host, r));
  const buildRow = (oxide: string, getter: (p: { oxides: Oxides; loi: number }) => number): ComparedOxideRow => {
    const values = parsed.map((p) => (p ? getter(p) : null));
    const first = values[0] ?? null;
    const deltas = values.map((v, i) => (i === 0 || first === null || v === null ? null : v - first));
    return { oxide, values, deltas };
  };
  const order = Object.keys(host.oxides.groups);
  const rows = order
    .filter((oxide) => parsed.some((p) => (p?.oxides[oxide] ?? 0) > 0))
    .map((oxide) => buildRow(oxide, (p) => p.oxides[oxide] ?? 0));
  if (parsed.some((p) => (p?.loi ?? 0) > 0)) rows.push(buildRow('LOI', (p) => p.loi));
  return rows;
}

export {
  COMPARED_SHEET_FIELDS,
  FIRED_SHEET_FIELDS,
  WORD_SHEET_FIELDS,
  effectiveSheet,
  compareSheets,
  sheetCones,
  rawAnalysis,
  compareAnalyses
};
