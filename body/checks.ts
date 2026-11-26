// Coded formulation warnings for clay bodies and casting slips (words live in catalog/english.ts).

import { warning } from '../problem.ts';
import type { Warning } from '../problem.ts';
import type { Host } from '../host.ts';
import type { BodyMakeup } from './makeup.ts';
import type { BodyClass, FormingMethod } from './types.ts';

export interface BodyCheckInput {
  bodyClass?: BodyClass;
  forming?: FormingMethod;
  isCastingSlip?: boolean;
  expansion?: number | null;
  makeup?: BodyMakeup | null;
  dryingShrinkage?: number | null;
}

/** Returns coded cautions for a body or casting slip from `host.bodies.checks`. */
function bodyChecks(host: Pick<Host, 'bodies'>, input: BodyCheckInput): Warning[] {
  const { checks } = host.bodies;
  const out: Warning[] = [];

  if (input.expansion !== null && input.expansion !== undefined) {
    out.push(warning('body-expansion-quartz', { expansion: input.expansion }));
  }

  const makeup = input.makeup ?? null;
  if (makeup && makeup.unknown.length > 0) {
    out.push(warning('body-unclassified-materials', { materials: makeup.unknown }));
  }

  if (
    input.bodyClass === 'porcelain' &&
    makeup &&
    makeup.unknown.length === 0 &&
    makeup.silica < checks.porcelainSilicaMin
  ) {
    out.push(warning('body-porcelain-low-silica', { silica: makeup.silica, min: checks.porcelainSilicaMin }));
  }

  if (
    typeof input.dryingShrinkage === 'number' &&
    Number.isFinite(input.dryingShrinkage) &&
    input.dryingShrinkage > checks.maxDryingShrinkage
  ) {
    out.push(
      warning('body-drying-shrinkage-high', { shrinkage: input.dryingShrinkage, max: checks.maxDryingShrinkage })
    );
  }

  const casting = Boolean(input.isCastingSlip || input.forming === 'casting');
  if (casting && makeup) {
    const [low, high] = checks.castingPlasticRange;
    if (makeup.unknown.length === 0 && (makeup.plastic < low || makeup.plastic > high)) {
      out.push(warning('body-casting-plastic-range', { plastic: makeup.plastic, low, high }));
    }
    if (makeup.plasticizer > checks.castingPlasticizerMax) {
      out.push(
        warning('body-casting-bentonite-high', {
          plasticizer: makeup.plasticizer,
          max: checks.castingPlasticizerMax
        })
      );
    }
  }

  return out;
}

export { bodyChecks };
