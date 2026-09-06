# Contributing

Thank you for improving FCM Studio. Open an issue describing the concrete research or usability problem before proposing substantial scope changes. Keep contributions focused and distinguish prototype functionality from production requirements.

## Setup and checks

Use Node.js 22 or newer, run `npm ci`, and start the app with `npm run dev`. The synthetic demonstration works without accounts or an AI provider.

Before opening a pull request, run:

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Linux environments may require `npx playwright install --with-deps chromium`. Playwright launches the development server automatically. Leave `PLAYWRIGHT_CHANNEL` unset for bundled Chromium; set it only when intentionally testing an installed browser channel.

Use TypeScript with explicit types and `unknown` for untrusted input. Add a failing unit test before changing model operations, import validation, or simulation logic. Keep end-to-end tests focused on user workflows rather than duplicating every numerical case. Run simplification, test coverage, and security review before substantial merges.

## Model and research guarantees

- Both views must operate on the same model and stable factor IDs. Do not introduce an independently maintained matrix copy.
- Preserve the row-source/column-target convention and validate all imported or generated data. Reject ambiguous input with an actionable message.
- Preserve baselines and run snapshots. Change the algorithm identifier when numerical behavior changes, and document the interpretation impact in `METHODOLOGY.md`.
- Keep AI proposals reviewable and explicitly attributed. Provider failures and malformed responses must leave the working project unchanged.
- Keep manual mapping and simulation usable without AI. Do not turn illustrative outputs into unsupported scientific claims.

## Data and credentials

Use synthetic fixtures only. Never commit participant workbooks, transcripts, identifying screenshots, project backups containing research data, or credentials. Fetch credentials through an approved secret manager such as 1Password and inject them into the process environment; do not store actual secrets in `.env` files or code. Tests must mock AI calls rather than consume a live provider key.

If reporting a bug with research data, reproduce it using a minimal synthetic example. For security issues involving sensitive material, use an appropriate private reporting channel instead of a public issue.

## Pull requests

Explain the user-visible problem, resulting behavior, and checks actually run. Identify skipped checks and remaining limitations. Include images for visual changes using synthetic data. Contributions are provided under this repository's Apache-2.0 license.
