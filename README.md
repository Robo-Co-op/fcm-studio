# FCM Studio

An open-source participatory research prototype by Robo Co-op. Build a Fuzzy Cognitive Map, edit its signed weight matrix, and compare model-based scenarios in one browser workspace.

The map and spreadsheet share one model: adding a factor creates a card, row, and column together. Editing a relationship updates both views immediately. This is a researcher-operated prototype for workshop facilitation, not a validated forecasting system.

## Run locally

Install Node.js 22 or newer and npm, then:

```sh
git clone https://github.com/Robo-Co-op/fcm-studio.git
cd fcm-studio
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. No account or AI key is required for mapping, importing, exporting, or simulation. The initial project is a synthetic demonstration, not participant research data.

## Workshop workflow

1. Start a project with a research agenda, or import an Excel matrix.
2. Add factors, connect cards, and assign influence weights. Rows are sources and columns are targets. Weights range from −1 to +1; zero removes a relationship. Presets include ±0.1, ±0.3, ±0.7, and ±0.9.
3. Use the map, matrix, or split view. Select a relationship in either view to inspect it; use search, polarity filters, and circular or grid layout to explore the model. Matrix cells support arrow-key navigation and rectangular tab-separated paste.
4. Set initial activations and optional fixed interventions in the simulation panel, then run and compare with the original baseline. Save named scenarios to revisit model and intervention settings.
5. Export a JSON project backup before replacing the current workspace. Export Excel or CSV for matrices, CSV for trajectories, and SVG or PNG for the current map viewport.

Excel import shows the detected range, labels, direction convention, and validation issues before replacing the workspace. Choose transpose if the original workbook uses columns as sources. Blank, textual, formula, or out-of-range weights must be corrected in the workbook; use numeric zero for no relationship. The adapter supports `FCM Values` and exports a companion `Range` sheet. A private supplied workbook was checked locally with 26 factors and 63 nonzero relationships; that workbook is not distributed here.

## Saving and boundaries

- IndexedDB autosaves one current project in this browser on this device. Browser storage is not a backup or shared workspace; export JSON regularly.
- JSON preserves factor identity, baseline, saved scenarios, and retained run history. Excel and matrix CSV contain the current matrix, not full project history. The application retains the latest 10 runs and supports up to 100 scenarios and 200 factors.
- Importing Excel establishes an immutable baseline. For a new empty project, the first simulation captures the baseline. Later edits change the working model. To establish a different baseline, export Excel and import it as a new project.
- Synchronization is between the in-app map and matrix. External Excel files do not update live.
- Map image export captures the current viewport; fit the map before exporting to include more of it.
- There are no accounts, real-time multi-user editing, or public hosted AI backend in this release. No production service is deployed by these setup commands.

See [METHODOLOGY.md](METHODOLOGY.md) for the update equation, reproducibility details, and interpretation limits.

## Optional AI drafting

The optional local Node service proposes a complete revised model and summary for review. Accept or reject a proposal explicitly. Changed and newly suggested content carries AI provenance; accepting a proposal does not establish participant consensus. Stale proposals cannot overwrite later edits, and manual work remains available when AI fails.

In a second terminal, configure `AI_MODEL` and `OPENAI_API_KEY` only in the process environment, then run `npm run server`. The service listens on `127.0.0.1:8787`; the development server proxies `/api` requests. Reload the browser after starting the AI service so its availability is detected.

For example, in PowerShell with an authenticated 1Password CLI session, replace the model and secret-reference placeholders:

```powershell
$env:AI_MODEL = '<your-compatible-model-id>'
$env:OPENAI_API_KEY = op read 'op://<vault>/<item>/<field>'
npm run server
```

Do not put actual keys in source files, `.env` files, screenshots, or commits. Clear the process environment when finished. `AI_BASE_URL` optionally selects an OpenAI-compatible endpoint; its default is `https://api.openai.com/v1`. The provider must support `/chat/completions` and JSON-object responses. HTTPS is required except for localhost providers.

AI requests send the agenda, editing instruction, and current model to the configured provider. Obtain the appropriate agreement before submitting participant material. The original workbook file itself is not uploaded by import. Automated AI tests use mocked provider responses; they do not establish live-provider compatibility.

The local service is designed for loopback use and has host/origin checks, validation, and a small in-memory rate limit. Public deployment requires a separate authentication, authorization, privacy, and operations design.

## Development

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts the development server automatically. `PLAYWRIGHT_CHANNEL` optionally selects an installed browser channel; leave it unset to use Playwright's Chromium. On Linux CI, install browsers with `npx playwright install --with-deps chromium`.

The application uses React, TypeScript, React Flow, ExcelJS, IndexedDB, and a Web Worker for deterministic simulation. See [CONTRIBUTING.md](CONTRIBUTING.md). Released under [Apache-2.0](LICENSE).

Release verification: 57 unit/service tests and seven browser scenarios passed locally; each browser scenario was also repeated three times. The AI provider boundary was mocked. The runtime dependency audit reported no high or critical findings and two moderate findings from ExcelJS's transitive `uuid` dependency. The suggested automatic fix downgrades ExcelJS, so it was not applied. Excel loading is deferred until needed; its bundle remains relatively large.
