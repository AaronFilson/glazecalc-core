// Clay-body, slip and test-bar calculations (lib/core/body/*) plus slurry and solids-density helpers.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as body from '../body/index.ts';
import * as recipe from '../recipe/index.ts';
import { HOST, IDS, record, linesOf, thrown } from './support.js';

const near = (actual, expected, within = 1e-6, what = '') =>
  assert.ok(Math.abs(actual - expected) <= within, `${what} ${actual} is not within ${within} of ${expected}`);

describe('zero-flux and triaxial body chemistry', () => {
  test('succeeds when fluxMoles === 0 (pure kaolin, clay+silica slip, pure silica)', () => {
    const kaolin = { id: 'kaolin-th', formula: { Al2O3: 1, SiO2: 2, H2O: 2 } };
    const pureKaolin = body.calculateBody(HOST, [{ material: kaolin, amount: 100 }]);
    assert.equal(pureKaolin.umf, null);
    assert.equal(pureKaolin.groups, null);
    assert.equal(pureKaolin.knaoMol, 0);
    assert.equal(pureKaolin.fluxMol, 0);
    assert.equal(pureKaolin.ironTitania, 0);
    near(pureKaolin.siAlRatio, 2, 1e-9);
    near(pureKaolin.loi, 13.95, 0.05);
    assert.deepEqual(
      pureKaolin.alumina.map(([ox, m]) => [ox, Math.round(m * 1000) / 1000]),
      [
        ['Al2O3', 1],
        ['SiO2', 2]
      ]
    );

    // Pure silica: zero flux AND zero alumina -> alumina formula and siAlRatio are null.
    const pureSilica = body.calculateBody(HOST, [{ material: record(IDS.silica), amount: 100 }]);
    assert.equal(pureSilica.umf, null);
    assert.equal(pureSilica.alumina, null);
    assert.equal(pureSilica.siAlRatio, null);
    assert.deepEqual(pureSilica.percent, [['SiO2', 100]]);

    // bodyChemistry works on a zero-flux result without moles or umf by reading analysis + molarMass.
    const derived = body.bodyChemistry(HOST, { analysis: pureKaolin.analysis, umf: null });
    assert.equal(derived.fluxMol, 0);
    near(derived.alumina[1][1], 2, 1e-6);
    const emptyDerived = body.bodyChemistry(HOST, { analysis: {}, umf: null });
    assert.equal(emptyDerived.fluxMol, 0);
    assert.equal(emptyDerived.alumina, null);
  });

  test('attaches Seger umf and groups when flux > 0, and supports map recipes and lookups', () => {
    const porcelain = body.calculateBody(HOST, [
      { material: record(IDS.epk), amount: 50 },
      { material: record(IDS.custer), amount: 25 },
      { material: record(IDS.silica), amount: 25 },
      { material: record(IDS.whiting), amount: 0 }
    ]);
    assert.ok(porcelain.umf !== null && porcelain.groups !== null);
    near(porcelain.groups.R2O + porcelain.groups.RO, 1, 1e-9);
    assert.ok(porcelain.knaoMol > 0 && porcelain.fluxMol >= porcelain.knaoMol);
    assert.ok(porcelain.ironTitania > 0);
    assert.ok(porcelain.siAlRatio > 4);

    // Map shape with lookup.
    const byRef = body.calculateBody(
      HOST,
      { silica: 50, epk: 50 },
      {
        lookup: (ref) =>
          ref === 'silica'
            ? { id: 's', label: 's', analysis: { SiO2: 100 }, loi: 0, formulaWeight: 100, warningCodes: [] }
            : {
                id: 'k',
                label: 'k',
                analysis: { Al2O3: 39.5, SiO2: 46.5, Fe2O3: 0.001 },
                loi: 14,
                formulaWeight: 100,
                warningCodes: []
              }
      }
    );
    assert.equal(byRef.umf, null);
    // Trace oxide below 0.005 wt% / 0.0005 mol per Al2O3 is filtered from display tables.
    assert.equal(
      byRef.percent.some(([ox]) => ox === 'Fe2O3'),
      false
    );
  });

  test('raises no-materials on empty recipes and invalid-amount on overflow', () => {
    assert.equal(thrown(() => body.calculateBody(HOST, [])).code, 'no-materials');
    assert.equal(
      thrown(() => body.calculateBody(HOST, [{ material: record(IDS.silica), amount: 0 }])).code,
      'no-materials'
    );
    assert.equal(
      thrown(() =>
        body.calculateBody(HOST, [
          { material: record(IDS.silica), amount: Number.MAX_VALUE },
          { material: record(IDS.silica), amount: Number.MAX_VALUE }
        ])
      ).code,
      'invalid-amount'
    );
  });
});

describe('body makeup and solids density', () => {
  test('classifies plastic clays, plasticizers, calcined clays, silica and unclassified records via traits', () => {
    assert.equal(body.isPlasticClass('ball clay'), true);
    assert.equal(body.isPlasticClass('plasticizer'), true);
    assert.equal(body.isPlasticClass('feldspar'), false);
    assert.equal(body.isPlasticClass(undefined), false);

    assert.equal(body.bodyPart(HOST, record(IDS.epk)), 'plastic');
    assert.equal(body.bodyPart(HOST, record(IDS.silica)), 'silica');
    assert.equal(body.bodyPart(HOST, record(IDS.custer)), 'other');
    assert.equal(body.bodyPart(HOST, { traits: { calcined: true, kaolin: true } }), 'other');
    assert.equal(body.bodyPart(HOST, { traits: { materialClass: 'ball clay' } }), 'plastic');
    assert.equal(body.bodyPart(HOST, { traits: { materialClass: 'silica' } }), 'silica');
    assert.equal(body.bodyPart(HOST, { traits: { materialClass: 'grog' } }), 'other');
    assert.equal(body.bodyPart(HOST, { traits: { plasticizer: true } }), 'plastic');
    assert.equal(body.bodyPart(HOST, { category: 'clay' }), 'plastic');
    assert.equal(body.bodyPart(HOST, { category: 'silica' }), 'silica');
    assert.equal(body.bodyPart(HOST, { id: 'mine', traits: { unclassified: true } }), null);

    assert.equal(body.bodyMakeup(HOST, []), null);
    assert.equal(body.bodyMakeup(HOST, undefined), null);

    const makeup = body.bodyMakeup(HOST, [
      { material: record(IDS.epk), amount: '48' },
      { material: { id: 'bent', traits: { plasticizer: true } }, amount: '2' },
      { material: record(IDS.silica), amount: '25' },
      { material: record(IDS.custer), amount: '15' },
      { material: { id: 'mystery', traits: { unclassified: true } }, amount: '5' },
      { material: { id: 'mystery', traits: { unclassified: true } }, amount: '5' },
      { material: { traits: { unclassified: true } }, amount: '0' }
    ]);
    near(makeup.plastic, 50);
    near(makeup.nonPlastic, 50);
    near(makeup.plasticizer, 2);
    near(makeup.silica, 25);
    assert.deepEqual(makeup.unknown, ['mystery']);

    const anonUnknown = body.bodyMakeup(HOST, [{ material: { traits: { unclassified: true } }, amount: 10 }]);
    assert.deepEqual(anonUnknown.unknown, []);
  });

  test('resolves sheet SG, mineral/kind SG, class densities and fallback in materialSg and bodySolidsSg', () => {
    assert.deepEqual(recipe.materialSg(HOST, { traits: { density: { mineral: null, sg: 2.554 } } }), {
      sg: 2.55,
      basis: 'sheet',
      source: 'sheet'
    });
    assert.equal(recipe.lineSolidsSg(HOST, { sheet: { density: '2.55' } }), 2.55);
    assert.equal(recipe.lineSolidsSg(HOST, { traits: { density: { mineral: null, sg: 2.72 } } }), 2.72);
    assert.equal(recipe.lineSolidsSg(HOST, record(IDS.silica)), 2.65);
    assert.equal(recipe.lineSolidsSg(HOST, { traits: { materialClass: 'plasticizer' } }), 2.5);
    assert.equal(recipe.lineSolidsSg(HOST, null, 2.58), 2.58);

    assert.deepEqual(recipe.bodySolidsSg(HOST, []), { sg: 2.6, worked: false });
    assert.deepEqual(recipe.bodySolidsSg(HOST, undefined, 2.55), { sg: 2.55, worked: false });
    const worked = recipe.bodySolidsSg(HOST, [
      ...linesOf([
        [IDS.epk, 50],
        [IDS.silica, 50]
      ]),
      { id: 'zero', amount: '0' }
    ]);
    assert.equal(worked.worked, true);
    near(worked.sg, 100 / (50 / 2.6 + 50 / 2.65));
  });
});

describe('slurry water per 100 g and water basis conversions', () => {
  test('converts slip SG <-> water per 100 g dry and dry <-> wet plasticity water', () => {
    const w = recipe.waterPer100(1.78, 2.6);
    near(w, (100 * (1 - 1.78 / 2.6)) / 0.78);
    near(recipe.sgFromWaterPer100(w, 2.6), 1.78);
    assert.equal(recipe.waterPer100(1, 2.6), null);
    assert.equal(recipe.waterPer100(2.6, 2.6), null);
    assert.equal(recipe.sgFromWaterPer100(0, 2.6), null);
    assert.equal(recipe.sgFromWaterPer100(40, 1), null);
    near(recipe.waterPer100(1.5), (100 * (1 - 1.5 / 2.6)) / 0.5);
    near(recipe.sgFromWaterPer100(50), 150 / (100 / 2.6 + 50));

    near(recipe.convertWaterBasis(25, 'dry'), 20);
    near(recipe.convertWaterBasis(20, 'wet'), 25);
    assert.equal(recipe.convertWaterBasis(0, 'dry'), null);
    assert.equal(recipe.convertWaterBasis(100, 'wet'), null);
    assert.equal(recipe.convertWaterBasis(NaN, 'dry'), null);
  });
});

describe('SHAB / ASTM C373 test bars, vitrification, and slip mixing', () => {
  test('computes bar shrinkages, absorption, porosity, bulk density and deformation', () => {
    assert.deepEqual(body.barResults(null), {});
    const full = body.barResults({
      mark: 100,
      dry: '94,0',
      fired: '88',
      firedWeight: '50',
      soakedWeight: '52.5',
      suspendedWeight: '30',
      bow: '0.5',
      sag: '1.25'
    });
    near(full.dryingShrinkage, 6);
    near(full.firingShrinkage, (6 / 94) * 100);
    near(full.totalShrinkage, 12);
    near(full.absorption, 5);
    near(full.porosity, (2.5 / 22.5) * 100);
    near(full.density, 50 / 22.5);
    near(full.deformation, 1.75);

    const partial = body.barResults({ mark: '', dry: true, sag: 2, bow: -1, firedWeight: 50, soakedWeight: 49 });
    assert.deepEqual(partial, { deformation: 2 });
  });

  test('orders vitrification points across Orton/informal cones and checks target ranges', () => {
    assert.deepEqual(body.vitrification(HOST, undefined), []);
    const pts = body.vitrification(HOST, [
      { cone: '10', bar: { mark: 100, fired: 87, firedWeight: 100, soakedWeight: 100.5 } },
      { cone: '^04', absorption: 14, totalShrinkage: 6 },
      { cone: '6', absorption: 1.8, totalShrinkage: 11 },
      { cone: '6', absorption: 1.2 },
      { cone: '9-10', absorption: 0.8 },
      { cone: 'unknown', absorption: 5 },
      { cone: 'unknown-b', absorption: 4 },
      { cone: '' },
      { cone: '6' }
    ]);
    assert.deepEqual(
      pts.map((p) => p.cone),
      ['04', '6', '9-10', '10', 'unknown', 'unknown-b']
    );
    near(pts[1].absorption, 1.5);
    near(pts[1].shrinkage, 11);

    const targets = { absorption: { min: 0.5, max: 2 }, shrinkage: { max: 12.5 } };
    assert.equal(body.insideTargets(pts[0], targets), false);
    assert.equal(body.insideTargets(pts[1], targets), true);
    // '9-10' has no shrinkage measured -> null when shrinkage target is set.
    assert.equal(body.insideTargets(pts[2], targets), null);
    assert.deepEqual(body.maturityRange(pts, { absorption: { max: 2 } }), { low: '6', high: '10' });
    assert.equal(body.maturityRange(pts, { absorption: { max: 0.1 } }), null);
    assert.equal(body.maturityRange(undefined, { absorption: { max: 2 } }), null);
    assert.equal(body.coneSortKey(HOST, 'orton', 'unknown-b'), Infinity);
    // Reverse sort branch for non-cone strings.
    const rev = body.vitrification(HOST, [
      { cone: 'z-cone', absorption: 2 },
      { cone: 'a-cone', absorption: 3 },
      { cone: '6', absorption: 1 }
    ]);
    assert.deepEqual(
      rev.map((p) => p.cone),
      ['6', 'a-cone', 'z-cone']
    );
  });

  test('totals casting-slip step additions and ageing days', () => {
    assert.equal(body.daysBetween('2026-11-20', '2026-11-25'), 5);
    assert.equal(body.daysBetween('bad', '2026-11-25'), null);

    const totals = body.slipMixTotals(
      '380',
      [
        { deflocculant: 3, water: '15,5' },
        { deflocculant: '0.5', water: '' },
        { deflocculant: true, water: null }
      ],
      1000
    );
    near(totals.deflocculant.amount, 3.5);
    near(totals.deflocculant.percent, 0.35);
    near(totals.water.amount, 395.5);
    near(totals.water.percent, 39.55);
    const empty = body.slipMixTotals('', undefined);
    assert.deepEqual(empty, { deflocculant: null, water: null });
    const noSize = body.slipMixTotals(100, [{ deflocculant: 2 }]);
    assert.deepEqual(noSize, {
      deflocculant: { amount: 2, percent: null },
      water: { amount: 100, percent: null }
    });
  });
});

describe('data-sheet and raw-analysis comparison, and body checks', () => {
  test('compares data sheets (including multi-cone fired arrays) and raw analyses', () => {
    assert.equal(body.effectiveSheet(undefined), undefined);
    const grolleg = {
      ...record(IDS.epk),
      sheet: {
        finer2um: 58,
        mesh: '0.05% > 53 µm',
        dryStrength: '1.0 MN/m²',
        fired: [
          { cone: '4', celsius: 1180, totalShrinkage: 9.0, absorption: 13.0 },
          { cone: '9', celsius: 1280, totalShrinkage: 13.0, absorption: 6.5 }
        ]
      }
    };
    const sp = {
      id: 'sp',
      analysis: { SiO2: 48, Al2O3: 36.5, K2O: '1,74' },
      loi: '12.5',
      sheet: {
        finer2um: 70,
        mesh: '0.04% > 53 µm',
        dryStrength: '1.4 MN/m²',
        fired: [{ celsius: 1280, totalShrinkage: 12.5, absorption: 6.5 }]
      }
    };
    const rows = body.compareSheets([grolleg, sp, {}]);
    const finer = rows.find((r) => r.field === 'finer2um');
    assert.deepEqual(finer, { field: 'finer2um', values: ['58', '70', ''], deltas: [null, 12, null], fired: false });
    const mesh = rows.find((r) => r.field === 'mesh');
    assert.deepEqual(mesh.deltas, [null, null, null]);

    const atCone4 = body.effectiveSheet(grolleg.sheet, '^4');
    assert.equal(atCone4.totalShrinkage, 9);
    assert.equal(body.effectiveSheet({ dryingShrinkage: 5 }).dryingShrinkage, 5);

    const cones = body.sheetCones([grolleg, sp, { sheet: { dryingShrinkage: 5 } }]);
    assert.deepEqual(cones, { cones: ['9', '1280 °C', ''], differ: true });
    assert.deepEqual(body.compareSheets(undefined), []);
    assert.deepEqual(body.sheetCones(undefined), { cones: [], differ: false });

    // Raw analyses across formula, analysis, molecular fields and percent fields.
    const kaolinFormula = { formula: { Al2O3: 1, SiO2: 2, H2O: 2 } };
    const badFormula = { formula: { H2O: 0 } };
    const molFields = record(IDS.whiting);
    const molNoLoi = {
      fields: [{ name: 'SiO2', amount: '1' }],
      molecularweight: 100
    };
    const emptyMol = { fields: [] };
    assert.equal(body.rawAnalysis(HOST, null), null);
    assert.equal(body.rawAnalysis(HOST, badFormula), null);
    assert.equal(body.rawAnalysis(HOST, emptyMol), null);
    near(body.rawAnalysis(HOST, molNoLoi).loi, 100 - HOST.oxides.molarMass['SiO2'], 0.01);

    const oxideRows = body.compareAnalyses(HOST, [grolleg, sp, kaolinFormula, molFields, null]);
    assert.ok(oxideRows.some((r) => r.oxide === 'SiO2'));
    assert.equal(oxideRows[oxideRows.length - 1].oxide, 'LOI');
    assert.deepEqual(body.compareAnalyses(HOST, undefined), []);
  });

  test('emits coded body formulation cautions from host.bodies.checks', () => {
    const all = body.bodyChecks(HOST, {
      bodyClass: 'porcelain',
      forming: 'casting',
      expansion: 6.2,
      dryingShrinkage: 8.1,
      makeup: { plastic: 35, nonPlastic: 65, plasticizer: 1.2, silica: 15, unknown: [] }
    });
    assert.deepEqual(
      all.map((w) => w.code),
      [
        'body-expansion-quartz',
        'body-porcelain-low-silica',
        'body-drying-shrinkage-high',
        'body-casting-plastic-range',
        'body-casting-bentonite-high'
      ]
    );

    const unclassified = body.bodyChecks(HOST, {
      bodyClass: 'porcelain',
      isCastingSlip: true,
      makeup: { plastic: 30, nonPlastic: 70, plasticizer: 0, silica: 10, unknown: ['m1'] }
    });
    assert.deepEqual(
      unclassified.map((w) => w.code),
      ['body-unclassified-materials']
    );

    assert.deepEqual(body.bodyChecks(HOST, {}), []);
  });
});
