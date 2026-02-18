# accessiguard

Scan any website for accessibility issues from your terminal.

Powered by [AccessiGuard](https://accessiguard.app).

## Quick start

```bash
npx accessiguard scan https://example.com
```

More examples:

```bash
npx accessiguard scan https://example.com --threshold 90
npx accessiguard scan https://example.com --json
npx accessiguard scan https://example.com --ci
```

## Installation

Global install:

```bash
npm i -g accessiguard
```

Then run:

```bash
accessiguard scan https://example.com
```

## CI/CD (GitHub Actions)

Use `--ci` for minimal logs and deterministic exit codes.

```yaml
name: accessibility-scan

on:
  push:
    branches: [main]
  pull_request:

jobs:
  accessiguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - name: Run accessibility scan
        run: npx accessiguard scan https://example.com --ci --threshold 75
```

Behavior in CI:
- Exit code `0` when score is greater than or equal to threshold
- Exit code `1` when score is below threshold
- Exit code `2` on runtime/network/API errors

## Options

- `scan <url>`: Scan a target URL
- `--threshold <number>`: Minimum score required to pass (default: `0`, CI default: `70`)
- `--json`: Print raw JSON response from the API
- `--ci`: CI mode with minimal output
- `--help`: Show CLI help
- `--version`: Show CLI version

## Output

Default mode prints a formatted report with:
- Colorized score status
- Visual score progress bar
- Issue counts by severity
- Top issues summary
- Link to full report

## API

`accessiguard` posts scan requests to:

- `https://accessiguard.app/api/scan`
- JSON body: `{ "url": "<target_url>" }`

## Requirements

- Node.js `18+` (native `fetch` required)

## License

MIT
