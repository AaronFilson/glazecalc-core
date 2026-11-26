# Changelog

Every change to the API (README, Versions) and every change to a number the library gives or holds has a line
here.

## 0.2.0 (2026-11-25)

Adds clay-body, slip and test-bar calculations (`@glazecalc/core/body`) and body/slip slurry and solids-density helpers.

- `Host.bodies` (`BodyTable`): required host table for body classes, slip SG ranges, material-class fallback densities and body-check thresholds.
- `Traits` and `types.ts`: `MaterialClass`, `plasticizer`, `unclassified`, explicit `DensityTrait.sg`, and `DataSheet` / `FiredReading` on `MaterialInput`.
- `recipe/density.ts`: `materialSg` supports explicit `DensityTrait.sg` (`basis: 'sheet'`); adds `lineSolidsSg` and `bodySolidsSg`.
- `recipe/slurry.ts`: adds `waterPer100`, `sgFromWaterPer100`, and `convertWaterBasis`.
- `body/index.ts` (`./body`): `calculateBody` (succeeds with `fluxMoles === 0`, returning fired oxide wt%, `Al2O3 = 1` formula, `KNaO` and total-flux `mol%`, `Fe2O3 + TiO2`, LOI, expansion, and optional Seger `umf`/`groups`), `bodyChemistry`, `aluminaFormula`, `bodyMakeup`, `bodyPart`, `isPlasticClass`, `barResults`, `vitrification`, `insideTargets`, `maturityRange`, `slipMixTotals`, `daysBetween`, `compareSheets`, `sheetCones`, `rawAnalysis`, `compareAnalyses`, and `bodyChecks`.

## 0.1.0 (2026-11-25)

The first release as its own repository, extracted from Glazecalc's `lib/core` with its history. Its code, tests and
outputs are Glazecalc's `lib/core` as of Glazecalc's commit 5b61d46a.

- `package.json` with the indexes in `exports`, MIT `LICENSE`, this CHANGELOG.
- Its own checks: tests with the coverage threshold, TypeScript 6 and 7, ESLint and Prettier, the output
  snapshot (`test/outputs.json`) and the three engines, and the boundary test moved in from Glazecalc.
