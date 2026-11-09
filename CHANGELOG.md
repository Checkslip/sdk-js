# Changelog

All notable changes to this package are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version may
include breaking changes; they are listed under "Changed".

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
