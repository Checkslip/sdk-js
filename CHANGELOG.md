# Changelog

All notable changes to this package are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). Until 1.0.0, a minor version may
include breaking changes; they are listed under "Changed".

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
