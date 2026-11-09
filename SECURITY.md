# Security

## Reporting a problem

Please report security problems to security@checkslip.com and not in a public issue. Include the package version,
your runtime and version, and the steps to reproduce. We will reply to confirm we received the report.

If you find a problem in the Checkslip API itself rather than in this package, use the same address.

## Supported versions

Security fixes go into the latest published version.

## Handling secrets

- Keep API keys (`csk_...`) and webhook signing secrets (`whsec_...`) on your server, in environment variables or a
  secret manager. Do not commit them or put them in a web page. The client refuses to start in a browser unless you
  pass `dangerouslyAllowBrowser: true`.
- If a key leaks, revoke it in the Checkslip dashboard and create a new one. If a webhook secret leaks, rotate it with
  `webhooks.endpoints.rotateSecret()`.
- Check the signature of every webhook with `verifyWebhook()` before acting on it.
