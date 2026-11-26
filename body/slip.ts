// Casting-slip mixing and ageing arithmetic: cumulative water and deflocculant additions as amounts
// and percentages of dry batch weight, and elapsed ageing days between ISO dates.

export interface SlipStepInput {
  deflocculant?: unknown;
  water?: unknown;
}

export interface SlipAdditionTotal {
  amount: number;
  percent: number | null;
}

export interface SlipMixTotals {
  deflocculant: SlipAdditionTotal | null;
  water: SlipAdditionTotal | null;
}

const readStepNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Whole days from `startIso` to `endIso` (YYYY-MM-DD), or null when either is not a valid date. */
function daysBetween(startIso: string, endIso: string): number | null {
  const from = Date.parse(startIso);
  const to = Date.parse(endIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Totals deflocculant and water added across mixing/ageing steps (including initial water), each
 * with its percentage of `dryWeight` when known and positive. Null for an addition with no numeric entries.
 */
function slipMixTotals(initialWater: unknown, steps: ReadonlyArray<SlipStepInput>, dryWeight?: unknown): SlipMixTotals {
  const size = readStepNumber(dryWeight);
  const sumValues = (values: unknown[]): SlipAdditionTotal | null => {
    const numbers = values.map(readStepNumber).filter((n): n is number => n !== null && n >= 0);
    if (!numbers.length) return null;
    const amount = numbers.reduce((a, b) => a + b, 0);
    return { amount, percent: size !== null && size > 0 ? (amount / size) * 100 : null };
  };
  const list = steps ?? [];
  return {
    deflocculant: sumValues(list.map((s) => s.deflocculant)),
    water: sumValues([initialWater, ...list.map((s) => s.water)])
  };
}

export { daysBetween, slipMixTotals };
