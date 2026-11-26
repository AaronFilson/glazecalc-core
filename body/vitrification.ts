// Vitrification curves across cones and maturity target-band checks.

import { ordinal } from '../cones/firing.ts';
import type { ConeScale } from '../cones/firing.ts';
import type { Host } from '../host.ts';
import { barResults } from './bars.ts';
import type { BarInput } from './bars.ts';
import type { RangeBound } from './types.ts';

export interface Targets {
  absorption?: RangeBound;
  shrinkage?: RangeBound;
}

export interface VitrificationInput {
  cone?: string;
  bar?: BarInput;
  absorption?: number;
  totalShrinkage?: number;
}

export interface VitrificationPoint {
  cone: string;
  firings: number;
  absorption?: number;
  shrinkage?: number;
}

/** Cone order from the host's chart, falling back to leading cone number ('04' -> -4, '6' -> 6, '9-10' -> 9). */
function coneSortKey(host: Pick<Host, 'cones'>, scale: ConeScale, cone: string): number {
  const chart = ordinal(host as Host, scale, cone);
  if (!Number.isNaN(chart)) return chart;
  const trimmed = cone.trimStart();
  const bare = trimmed.startsWith('^') ? trimmed.slice(1).trimStart() : trimmed;
  const first = /^\d+(?:\.\d+)?/.exec(bare);
  if (!first) return Infinity;
  const token = first[0];
  const value = Number(token);
  return token.length > 1 && token.startsWith('0') && token[1] !== '.' ? -value : value;
}

const within = (value: number, range: RangeBound): boolean =>
  (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max);

/**
 * Whether a cone's averages lie within every target bound set, or null when a targeted measurement
 * is missing at that cone.
 */
function insideTargets(point: VitrificationPoint, targets: Targets): boolean | null {
  let inside = true;
  for (const key of ['absorption', 'shrinkage'] as const) {
    const range = targets[key];
    if (!range) continue;
    const value = point[key];
    if (value === undefined) return null;
    inside = inside && within(value, range);
  }
  return inside;
}

/**
 * Averages absorption and total shrinkage at each cone across firings, ordered lowest cone first.
 * Firings without a cone or without either figure are skipped.
 */
function vitrification(
  host: Pick<Host, 'cones'>,
  firings: ReadonlyArray<VitrificationInput>,
  scale: ConeScale = 'orton'
): VitrificationPoint[] {
  const byCone = new Map<string, { cone: string; absorption: number[]; shrinkage: number[]; firings: number }>();
  for (const firing of firings ?? []) {
    const raw = firing.cone?.trim();
    if (!raw) continue;
    const fromBar = firing.bar ? barResults(firing.bar) : {};
    const absorption = firing.absorption ?? fromBar.absorption;
    const shrinkage = firing.totalShrinkage ?? fromBar.totalShrinkage;
    if (absorption === undefined && shrinkage === undefined) continue;
    const key = raw.toLowerCase().replace(/^\^/, '');
    const point = byCone.get(key) ?? { cone: key, absorption: [], shrinkage: [], firings: 0 };
    point.firings += 1;
    if (absorption !== undefined) point.absorption.push(absorption);
    if (shrinkage !== undefined) point.shrinkage.push(shrinkage);
    byCone.set(key, point);
  }
  const mean = (values: number[]): number | undefined =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  return [...byCone.values()]
    .sort((a, b) => {
      const [ka, kb] = [coneSortKey(host, scale, a.cone), coneSortKey(host, scale, b.cone)];
      if (ka !== kb) return ka === Infinity ? 1 : kb === Infinity ? -1 : ka - kb;
      return a.cone < b.cone ? -1 : a.cone > b.cone ? 1 : 0;
    })
    .map((p) => ({
      cone: p.cone,
      firings: p.firings,
      ...(mean(p.absorption) !== undefined ? { absorption: mean(p.absorption) } : {}),
      ...(mean(p.shrinkage) !== undefined ? { shrinkage: mean(p.shrinkage) } : {})
    }));
}

/** Lowest and highest cone among ordered vitrification points that meet `targets`, or null when none do. */
function maturityRange(
  points: ReadonlyArray<VitrificationPoint>,
  targets: Targets
): { low: string; high: string } | null {
  const matching = (points ?? []).filter((point) => insideTargets(point, targets) === true);
  if (!matching.length) return null;
  return { low: matching[0]!.cone, high: matching[matching.length - 1]!.cone };
}

export { coneSortKey, insideTargets, vitrification, maturityRange };
