# Changelog

All notable changes to this package are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version may
include breaking changes; they are listed under "Changed".

## [0.4.0](https://github.com/Checkslip/sdk-js/compare/v0.3.1...v0.4.0) (2026-11-10)


### ⚠ BREAKING CHANGES

* The free_reason filter on slips.list() and slips.exports.create() takes only the nine reasons a customer can receive, typed as CustomerFreeReason. PENDING, NO_CREDIT and HOLD_EXPIRED are not among them, so TypeScript code that passes one of those, or a plain string, no longer type-checks. In plain JavaScript nothing stops the call, and the API accepts only the nine. The reason a lookup reports back is unchanged: still FreeReason, including a value this version does not know. Counts still take the filter and still ignore it, so nothing changes there.
* UsageCounts no longer has free_no_credit or free_hold_expired. Both had been returning 0 on every account before this release, and the API has now removed them from UsageCounts. TypeScript code that reads either one no longer type-checks. In plain JavaScript the read returns undefined with no error, so delete those reads before you upgrade. A lookup that was not charged, with no reason given, counts in free_other.

### Features

* the free_reason filter takes the reasons a customer receives ([52fa306](https://github.com/Checkslip/sdk-js/commit/52fa306d7bd41c1fe04815f4faf56b181dbb0983))
* usage counts no longer have free_no_credit or free_hold_expired ([4fe1806](https://github.com/Checkslip/sdk-js/commit/4fe1806b02aa2207a62926e5b1f737b399e6d538))

## [0.3.1](https://github.com/Checkslip/sdk-js/compare/v0.3.0...v0.3.1) (2026-11-10)


### Bug Fixes

* **docs:** say what an exhaustive match really needs ([b3a55a7](https://github.com/Checkslip/sdk-js/commit/b3a55a7b9650d1f0147ae42d1d6690ce9d74ed3a))

## [0.3.0](https://github.com/Checkslip/sdk-js/compare/v0.2.1...v0.3.0) (2026-11-09)


### ⚠ BREAKING CHANGES

* **audit:** the four request filters are typed as arrays instead of single values. A call that passed one value now passes an array of one.

### Features

* **audit:** take several values per request filter ([d5bebb3](https://github.com/Checkslip/sdk-js/commit/d5bebb3c292697fd31f07149605e5ff333ab4af5))

## [0.2.1](https://github.com/Checkslip/sdk-js/compare/v0.2.0...v0.2.1) (2026-11-09)


### Bug Fixes

* **types:** take free_other and OTHER from the published document ([1a49ec3](https://github.com/Checkslip/sdk-js/commit/1a49ec3926d7ec560f88af5767a859d285d7c286))

## [0.2.0](https://github.com/Checkslip/sdk-js/compare/v0.1.1...v0.2.0) (2026-11-09)


### ⚠ BREAKING CHANGES

* **usage:** free_no_credit and free_hold_expired are deprecated and will disappear. The API no longer counts either reason, so both are always 0 and both fields will be removed from the response. They are optional from this version, so code that reads them has to handle them being absent. The counts they used to carry are in free_other.

### Features

* **usage:** add free_other and retire two free counts ([c492ef4](https://github.com/Checkslip/sdk-js/commit/c492ef4f018c335c8c8c806a8d43b02cd88659a0))


### Bug Fixes

* **ci:** publish through the release workflow, never directly ([e920310](https://github.com/Checkslip/sdk-js/commit/e920310b2f4d67a26f220017937bdeb8d7d8c972))
* **ci:** stop the publish job waiting for itself ([d54996f](https://github.com/Checkslip/sdk-js/commit/d54996f2c0cb5107e0e1709db215626a95a31540))

## [0.1.1](https://github.com/Checkslip/sdk-js/compare/v0.1.0...v0.1.1) (2026-11-09)


### Bug Fixes

* **ci:** bump the version constant and stop CI cancelling itself ([503c8ce](https://github.com/Checkslip/sdk-js/commit/503c8ce78477d837d35a958155e60977ed9e6b22))
* **ci:** call publish from the release job ([7c6817e](https://github.com/Checkslip/sdk-js/commit/7c6817e10f5caa34040be75bc4adee54dd51acda))
* **ci:** check the release pull request before it is merged ([29f45e6](https://github.com/Checkslip/sdk-js/commit/29f45e6bb46bafc7d3adf3834d74be9ed8f64135))

## 0.1.0 (2026-11-09)


### ⚠ BREAKING CHANGES

* **audit:** drop checkpoints, chain checks and signing keys
* **api:** nest resources to match the shared surface

### Features

* add the Checkslip API client with generated types ([41a173c](https://github.com/Checkslip/sdk-js/commit/41a173c83557f5dc95c7b6dfdfc4fac4c2812bbb))
* **audit:** drop checkpoints, chain checks and signing keys ([a0b824c](https://github.com/Checkslip/sdk-js/commit/a0b824cd2a3b78c72b7d9dd4bdfc998809f0da87))


### Bug Fixes

* **ci:** let release-please cut 0.1.0 as the first release ([0abe561](https://github.com/Checkslip/sdk-js/commit/0abe5615b9e338d77ee466ab722c8d10947587ff))
* **ci:** pin a release-please action that exists ([2a4bd13](https://github.com/Checkslip/sdk-js/commit/2a4bd1371228a15d5c41117ed3e02a93b71db261))
* **client:** accept any fetch-shaped function ([f484c5e](https://github.com/Checkslip/sdk-js/commit/f484c5e186a102a1d17ccc6817f48d86735391d7))
* **slips:** hide fields being withdrawn from the API ([ea12345](https://github.com/Checkslip/sdk-js/commit/ea123456de1a22b245b745c52cf96d7c342d09e6))


### Miscellaneous Chores

* cut the first release as 0.1.0 ([822dfd8](https://github.com/Checkslip/sdk-js/commit/822dfd88766b1ca832da3027b228d6956c87f36a))


### Code Refactoring

* **api:** nest resources to match the shared surface ([ebfa3b4](https://github.com/Checkslip/sdk-js/commit/ebfa3b45ec297e0a7583fcf3a9e906a2ade5852b))

## [0.1.0] - Unreleased

### Added

- `Checkslip` client with `apiKey`, `baseUrl`, `timeoutMs`, `maxRetries`, `fetch` and `defaultHeaders` options.
- `slips.lookup()` by QR text or by image (multipart), with an automatic Idempotency-Key.
- `slips.list()`, `slips.get()`, `slips.counts()` and `slips.exports.*`.
- `billing.balance()`, `billing.getInfo()`, `billing.updateInfo()`, `billing.packages()`, `billing.ledger.list()`, `billing.orders.*` and `billing.receipts.*`.
- `usage.get()` and `banks.list()`.
- `webhooks.endpoints.*`, `webhooks.deliveries.*` and `webhooks.eventTypes()`.
- `audit.events.*`, `audit.requests.*`, `audit.checkpoints.*`, `audit.chain.check()`, `audit.exports.*` and `audit.signingKeys()`.
- `verifyWebhook()` and `signWebhook()` for Standard Webhooks signatures, with support for two secrets during a rotation.
- Error classes per HTTP status, each with `status`, `code`, `requestId` and the problem body.
- Retries with exponential backoff and jitter for 429, `IDEMPOTENCY_IN_FLIGHT`, and 5xx or network errors on requests that are safe to repeat.
- Cursor pagination with `for await` over every item, or page by page.
- Types generated from the Checkslip OpenAPI document.

[0.1.0]: https://github.com/Checkslip/sdk-js/releases/tag/v0.1.0
