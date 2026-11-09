# Releasing

Releases are driven by the commit messages on `main`. Nobody edits a version
number by hand.

## How it works

1. Every merge to `main` updates a release pull request, opened by
   release-please. It works out the next version from the Conventional Commits
   since the last release, writes `CHANGELOG.md` and bumps `package.json`.
2. Merging that pull request tags `vX.Y.Z` and publishes a GitHub Release.
3. The release triggers `publish.yml`, which:
   - waits for the checks on that exact commit and stops if any failed,
   - refuses to continue if the version is already on npm,
   - rebuilds, runs the dist smoke tests, publint and arethetypeswrong,
   - publishes with npm trusted publishing, so no token is stored anywhere and
     provenance is attached automatically,
   - uploads the published tarball to the release.

`feat:` gives a minor bump, `fix:` a patch, and a `!` or a `BREAKING CHANGE:`
footer a major one. Before 1.0.0 a breaking change bumps the minor.

## What a human has to do once

- **0.1.0 is published by hand**, from a commit whose CI is green, by whoever
  holds the npm account. release-please takes over from 0.1.1.
- **npm trusted publishing** has to be configured once on npmjs.com for
  `@checkslip/sdk`. Fill it in as:
  - repository: `Checkslip/sdk-js`
  - workflow: `release-please.yml`
  - environment: `release`

  The workflow is **`release-please.yml`, not `publish.yml`**, even though the
  publish happens in `publish.yml`. The OIDC token's `workflow_ref` claim names
  the workflow that started the run, and `publish.yml` is a reusable workflow
  called by the release job. Naming the reusable file makes npm reject the
  token. No token is created either way.
- **Provenance needs a public repository.** On a private repository the publish
  still works, but without a provenance attestation.
- Allow GitHub Actions to create pull requests in the repository settings, or
  release-please cannot open its release pull request.
- A `release` environment gates the publish job, so a release can require a
  review before it goes out.

## If something goes wrong

A published version cannot be replaced. Fix forward: land the fix on `main` and
let release-please cut the next patch.
