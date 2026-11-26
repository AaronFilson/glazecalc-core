// Clay-body and slip chemistry: fired oxide weight percents, alumina-unity formula (Al2O3 = 1),
// oxide mole percents (KNaO, total flux), Fe2O3 + TiO2, LOI and expansion, without requiring flux
// (fluxMoles === 0 succeeds cleanly for pure kaolins, clay+silica slips, engobes and washes).

import { expansion } from '../chemistry/expansion.ts';
import * as oxides from '../chemistry/oxides.ts';
import { readLine, recipeLines } from '../chemistry/umf.ts';
import type { Lookup } from '../chemistry/umf.ts';
import { problem } from '../problem.ts';
import type { Warning } from '../problem.ts';
import type { OxideGroup, Oxides, RecipeLine } from '../types.ts';
import type { Host } from '../host.ts';

/** Below this weight percent an oxide is a trace left off the body's sorted table. */
const BODY_TRACE = 0.005;

export interface BodyChemistry {
  /** Fired weight percent of each oxide (>= 0.005%), largest first. */
  percent: Array<[string, number]>;
  /** Moles of each oxide per mole of Al2O3, in the host's oxide order; null with no alumina. */
  alumina: Array<[string, number]> | null;
  /** Mole percent of K2O + Na2O across all fired oxides. */
  knaoMol: number;
  /** Mole percent of all R2O + RO flux oxides across all fired oxides. */
  fluxMol: number;
  /** Combined fired weight percent of Fe2O3 + TiO2. */
  ironTitania: number;
}

export interface BodyResult extends BodyChemistry {
  /** Fired oxide weight percents, unrounded. */
  analysis: Oxides;
  /** Mole percent of each fired oxide (summing to 100). */
  molePercent: Oxides;
  /** SiO2 : Al2O3 molar ratio, or null without alumina. */
  siAlRatio: number | null;
  /** Percent of the raw batch weight lost on firing. */
  loi: number;
  /** Calculated glass-factor thermal expansion, x10^-6 per °C. */
  expansion: number | null;
  /** Seger unity formula (R2O + RO = 1) when flux is present, or null when fluxMoles === 0. */
  umf: Oxides | null;
  /** Seger group totals when flux is present, or null when fluxMoles === 0. */
  groups: Record<OxideGroup, number> | null;
  /** Non-fatal material preparation warnings, as codes. */
  warningCodes: Warning[];
}

/** Moles of each oxide per 1.0 mole of Al2O3, in the host's oxide order, or null without Al2O3. */
function aluminaFormula(host: Pick<Host, 'oxides'>, moles: Oxides): Array<[string, number]> | null {
  const al = moles['Al2O3'] || 0;
  if (!(al > 0)) return null;
  const order = Object.keys(host.oxides.groups);
  return Object.entries(moles)
    .filter(([oxide, m]) => Object.hasOwn(host.oxides.groups, oxide) && m > 0)
    .map(([oxide, m]): [string, number] => [oxide, m / al])
    .filter(([, m]) => m >= BODY_TRACE / 10)
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
}

/**
 * Derives a body's display tables and summary figures from fired `analysis` and optional `umf` or
 * `moles`. Works even when `umf` is null (zero-flux bodies) by reading molar proportions from
 * `analysis` and `host.oxides.molarMass`.
 */
function bodyChemistry(
  host: Pick<Host, 'oxides'>,
  input: { analysis: Oxides; umf?: Oxides | null; moles?: Oxides }
): BodyChemistry {
  const percent = Object.entries(input.analysis)
    .filter(([, p]) => p >= BODY_TRACE)
    .sort((a, b) => b[1] - a[1]);
  const sourceMoles: Oxides =
    input.moles ??
    input.umf ??
    Object.fromEntries(
      Object.entries(input.analysis)
        .filter(([oxide, wt]) => wt > 0 && Boolean(host.oxides.molarMass[oxide]))
        .map(([oxide, wt]) => [oxide, wt / host.oxides.molarMass[oxide]!])
    );
  const entries = Object.entries(sourceMoles).filter(([oxide, m]) => Object.hasOwn(host.oxides.groups, oxide) && m > 0);
  const total = entries.reduce((sum, [, m]) => sum + m, 0);
  const molShare = (predicate: (oxide: string) => boolean): number =>
    total > 0 ? (100 * entries.filter(([oxide]) => predicate(oxide)).reduce((sum, [, m]) => sum + m, 0)) / total : 0;
  return {
    percent,
    alumina: aluminaFormula(host, sourceMoles),
    knaoMol: molShare((oxide) => oxide === 'K2O' || oxide === 'Na2O'),
    fluxMol: molShare((oxide) => oxides.isFlux(host as Host, oxide)),
    ironTitania: (input.analysis['Fe2O3'] || 0) + (input.analysis['TiO2'] || 0)
  };
}

/**
 * Calculates the chemistry of a clay body, slip, engobe or wash. Succeeds when `fluxMoles === 0`,
 * returning `umf: null` and `groups: null`, and attaches the Seger unity formula when flux > 0.
 */
function calculateBody(
  host: Host,
  recipe: RecipeLine[] | Record<string, unknown>,
  options?: { lookup?: Lookup } | null
): BodyResult {
  const moles: Oxides = {};
  let batchWeight = 0;
  let loiWeight = 0;
  let firedWeight = 0;
  const warningCodes: Warning[] = [];

  recipeLines(recipe).forEach((line) => {
    const read = readLine(host, line, options?.lookup);
    if (!read) return;
    const { amount, label, material } = read;
    warningCodes.push(...material.warningCodes);
    batchWeight += amount;
    loiWeight += (amount * material.loi) / 100;
    Object.keys(material.analysis).forEach((oxide) => {
      const oxideWeight = (amount * material.analysis[oxide]!) / 100;
      moles[oxide] = (moles[oxide] || 0) + oxideWeight / host.oxides.molarMass[oxide]!;
      firedWeight += oxideWeight;
    });
    if (!isFinite(batchWeight) || !isFinite(loiWeight) || !isFinite(firedWeight)) {
      throw problem('invalid-amount', { material: label });
    }
  });

  if (!(firedWeight > 0)) throw problem('no-materials');

  let fluxMoles = 0;
  let allMoles = 0;
  Object.keys(moles).forEach((oxide) => {
    if (oxides.isFlux(host, oxide)) fluxMoles += moles[oxide]!;
    allMoles += moles[oxide]!;
  });

  const analysis: Oxides = {};
  const molePercent: Oxides = {};
  Object.keys(moles).forEach((oxide) => {
    analysis[oxide] = ((moles[oxide]! * host.oxides.molarMass[oxide]!) / firedWeight) * 100;
    molePercent[oxide] = (moles[oxide]! / allMoles) * 100;
  });

  let umf: Oxides | null = null;
  let groups: Record<OxideGroup, number> | null = null;
  if (fluxMoles > 0) {
    umf = {};
    groups = { R2O: 0, RO: 0, R2O3: 0, RO2: 0 };
    Object.keys(moles).forEach((oxide) => {
      const u = moles[oxide]! / fluxMoles;
      umf![oxide] = u;
      groups![host.oxides.groups[oxide]!] += u;
    });
  }

  const summary = bodyChemistry(host, { analysis, moles });
  const al = moles['Al2O3'] || 0;
  return {
    ...summary,
    analysis,
    molePercent,
    siAlRatio: al > 0 ? (moles['SiO2'] || 0) / al : null,
    loi: (loiWeight / batchWeight) * 100,
    expansion: expansion(host, analysis),
    umf,
    groups,
    warningCodes
  };
}

export { BODY_TRACE, aluminaFormula, bodyChemistry, calculateBody };
