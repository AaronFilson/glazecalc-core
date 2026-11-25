# The chemistry core

Glaze chemistry with no state, no tables and no words (Glazecalc's [ADR 30](https://github.com/AaronFilson/glazecalc/blob/master/docs/adr/0030-nameless-chemistry-core.md) and
[ADR 31](https://github.com/AaronFilson/glazecalc/blob/master/docs/adr/0031-functional-core.md)). It works out unity formulas, fits and selects materials, checks a recipe
against limits and its cone, finds swaps, solves for a target, blends, and works out density, cost and slurry.
It knows no material by name and keeps nothing between calls: what it needs comes with each call.

## Importing

Import from an index, never a file inside the library (Glazecalc holds itself to this with an ESLint rule):

| Index                    | What it has                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`               | the host's shape, identities, problems, traits and record types; each area as a namespace (`chemistry`, `recipe`, `cones`), since a name such as `unityOf` is in more than one |
| `chemistry/index.ts`     | unity formulas, fitting and selecting, oxides, lead, expansion                                                                                                                 |
| `recipe/index.ts`        | everything about recipes                                                                                                                                                       |
| `recipe/basics/index.ts` | a finer index: plain numbers, the record shape, amounts, a recipe's materials, density                                                                                         |
| `cones/index.ts`         | firing blocks and the cone charts' order, bands and conversions                                                                                                                |

A CommonJS `require` of an index takes all of it into a bundle, so the finer indexes let a page take only what
it needs.

## The host argument

Every function that reads a table or a record takes a `Host` first (`host.ts`). The same host and the same
arguments always give the same answer, in any realm: a page, a worker, a test.

- **Readers** (all optional): `idOf`, `labelOf`, `keyOf` and `traitsOf`. A reader left out is the default: the
  record's own `id`, its identity as its label, its identity and chemistry as the same-material key, and its own
  `traits`.
- **Tables**: `oxides`, `cones`, `limits`, `stull`, `densities`, `expansion`.
- **Policy**: the markets each region's library also lists, and cone fit's margins and cut-offs.

The catalog ([glazecalc-catalog](https://github.com/AaronFilson/glazecalc-catalog)) has Glazecalc's tables; a host may bring its own.

## Records

A record is its identity and its chemistry (`types.ts`): a molar formula, a weight-percent analysis, or the
stored `{ fields, percentmole, loi }` shape. The core never reads a name. A host's records may carry anything
else, and the core passes back the records it was given.

## Ids and labels

An identity is a string or a number that the core only compares and passes back (`identity.ts`). A label is
what a result calls a record: by default its identity; Glazecalc's is the name. Swaps keep the ids beside the
labels as a property that is not enumerable (`IDS`).

## Codes as API

The core says what it found as a code and its values, never a sentence (`problem.ts`): a `Problem` (an `Error`
with `code` and `params`) when it cannot go on, and a `Warning` (`{ code, params }`) beside a result. The
values are numbers, oxides, flags and ids. The codes are the API: the catalog words every one of them in
English, and a test holds that none is left out.

## Units

- Oxide amounts are moles, a unity formula, or weight percent, as each type says.
- Temperatures are °C.
- Recipe amounts are the host's own, with a basis: percent, parts or grams.
- Densities are g/cm³.

## Runtime

ES modules in erasable TypeScript (ES2024, `strict`, no Node or DOM types), with no dependencies. It runs as it
is in Node 24, and in any bundler that strips types. Its own tests are in `test/` (`npm test`), at 98%
of branches or more.

`test/engine-outputs.js` is its output check for other engines: `npm run check:engines` (scripts/outputs.mjs)
bundles it and runs it in Node, JavaScriptCore and SpiderMonkey, and every output must be the same text in all three.

## Using it

The library is TypeScript source with no build step: a host loads the `.ts` files as they are (Node 24 strips the
types; a bundler such as esbuild does too). Mount it as a git submodule:

```sh
git submodule add https://github.com/AaronFilson/glazecalc-core lib/core
```

Its `package.json` names the package `@glazecalc/core` and maps its indexes in `exports`, for a host that resolves
it as a package. It is not on npm yet.

## Versions

`0.x` until a second app uses it: [Glazecalc](https://github.com/AaronFilson/glazecalc) does now, and Glaze Vault will. Its main branch is always
releasable, because hosts follow it.

**The API**, which only a major version may rename or remove (a minor one while `0.x`):

- the exports of each index (`index.ts`, and those of `chemistry`, `recipe`, `recipe/basics` and `cones`);
- the problem, warning and message codes, and their values;
- the trait keys;
- the host argument's shape (`Host`, `Readers`, `Policy`);
- the record shape the core reads, and its kinds;
- `WORK`, the most work a search may do.

Any change to a number the library gives or holds gets a line in the CHANGELOG: none is silent. The output
snapshot (`test/outputs.json`) makes such a change visible: `npm run check:outputs` fails until it is kept with
`node scripts/outputs.mjs --write`.

## Checks

```sh
npm ci
npm test                 # node:test, with the coverage threshold
npm run typecheck        # TypeScript 6 and 7
npm run lint && npm run format:check
npm run check:outputs    # every output against the kept snapshot
npm run check:engines    # the same outputs in Node, JavaScriptCore and SpiderMonkey (npx esvu install jsc, spidermonkey)
```

## History

It began in [Glazecalc](https://github.com/AaronFilson/glazecalc) as `lib/core`, and this repository keeps its commits from there. Their messages
name Glazecalc's pull requests in full, as `AaronFilson/glazecalc#152`. What came before, in Glazecalc's `lib/chemistry`,
`lib/recipe` and `lib/cones`, is in Glazecalc's history.

## Licence

MIT (`LICENSE`).
