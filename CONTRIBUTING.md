# Contributing

Thanks for helping. Bug reports and pull requests are welcome at
https://github.com/Checkslip/sdk-js.

## Setup

You need Node.js 22 or later. Bun is optional, and the test suite runs on both.

```sh
npm ci
npm test          # vitest on Node
bun test          # the same tests on Bun
npm run lint      # biome
npm run typecheck # tsc --noEmit
npm run build     # tsup: dist/ with ESM, CJS and .d.ts
npm run test:dist # load the built bundles
npm run check:package # publint and arethetypeswrong
```

## Generated types

`src/generated/` is generated from `spec/openapi.json`. Do not edit it by hand. To pick up API changes, replace
`spec/openapi.json` with the current document from https://api.checkslip.com and run:

```sh
npm run generate
```

`scripts/generate.mjs` drops response fields that are leaving the customer API before it generates the types. CI
fails if the committed files differ from what the script produces.

## Pull requests

- Add or update tests for any behavior change. Tests use a mocked `fetch` and never call the live API.
- Add a line to `CHANGELOG.md` under "Unreleased".
- Keep runtime dependencies at zero.

## Releasing

Maintainers bump `version` in `package.json` and `src/version.ts`, move the changelog entries under the new
version, commit, and push a tag `vX.Y.Z`. The release workflow checks the tag against `package.json`, runs every
check, and publishes to npm with provenance.
