// Shapes and host tables for clay bodies and slips (body/index.ts).

import type { MaterialClass } from '../traits.ts';

export type BodyClass =
  'terra cotta' | 'white earthenware' | 'stoneware' | 'porcelain' | 'flameware' | 'sculpture or raku' | 'paper clay';

export type FormingMethod =
  'throwing' | 'handbuilding' | 'casting' | 'pressing' | 'jiggering' | 'extruding' | 'sculpture';

export type FitTestKind = 'iwct' | 'bwiw' | 'pressure' | 'gbbt' | 'other';
export type FitResult = 'passed' | 'crazed' | 'shivered';

/** An open or closed numeric range. */
export interface RangeBound {
  readonly min?: number;
  readonly max?: number;
}

/** Reference maturity range and typical fired targets for a body class. */
export interface BodyClassSpec {
  readonly coneRange?: readonly [string, string];
  readonly absorption?: RangeBound;
  readonly shrinkage?: RangeBound;
}

/** Typical specific gravity range for a slip kind. */
export interface SlipRange {
  readonly sg: RangeBound;
}

/** Thresholds for body formulation checks (body/checks.ts). */
export interface BodyCheckThresholds {
  /** Minimum added silica (% of dry batch) below which a porcelain tends to craze glazes. */
  readonly porcelainSilicaMin: number;
  /** Drying shrinkage (%) above which cracking and warping risk rises. */
  readonly maxDryingShrinkage: number;
  /** Typical plastic clay share (% of dry batch) for a casting slip. */
  readonly castingPlasticRange: readonly [number, number];
  /** Swelling plasticizer share (% of dry batch) above which a casting slip gels or drains poorly. */
  readonly castingPlasticizerMax: number;
}

/** The clay-body tables and thresholds a host gives the core (host.bodies): catalog's BODIES (lib/catalog/bodies.ts). */
export interface BodyTable {
  readonly classes: Readonly<Record<BodyClass, BodyClassSpec>>;
  readonly slipRanges: Readonly<Record<string, SlipRange>>;
  readonly classDensities: Readonly<Record<MaterialClass, number>>;
  readonly checks: BodyCheckThresholds;
}
