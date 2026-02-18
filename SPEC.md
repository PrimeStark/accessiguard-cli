# accessiguard-cli — Specification

## Overview
CLI tool for scanning website accessibility from the terminal. Wraps the AccessiGuard API at `https://accessiguard.app/api/scan`.

## Usage
```bash
npx accessiguard scan https://example.com
npx accessiguard scan https://example.com --threshold 90
npx accessiguard scan https://example.com --json
npx accessiguard scan https://example.com --ci
```

## Commands
- `scan <url>` — Scan a URL for accessibility issues

## Flags
- `--threshold <number>` — Minimum score to pass (default: 0). Exit code 1 if score < threshold.
- `--json` — Output raw JSON instead of formatted terminal output.
- `--ci` — CI mode: minimal output, exit code based on threshold (default threshold in CI: 70).
- `--help` — Show help.
- `--version` — Show version.

## Architecture
- Single file CLI: `bin/accessiguard.js`
- Zero dependencies (use native fetch, built-in Node.js modules only)
- Node.js 18+ required (for native fetch)
- Shebang: `#!/usr/bin/env node`

## API Integration
POST `https://accessiguard.app/api/scan`
Body: `{ "url": "<target_url>" }`
Response: JSON with scan results including score, violations, categories, etc.

## Terminal Output Format
```
🔍 Scanning https://example.com...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  AccessiGuard Accessibility Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Score: 85/100 ██████████████████░░ Needs Improvement

  Issues Found: 12
  ├─ Critical: 2
  ├─ Serious: 4
  ├─ Moderate: 3
  └─ Minor: 3

  Top Issues:
  1. [critical] Images must have alternate text (4 instances)
  2. [serious] Form elements must have labels (3 instances)
  3. [moderate] Links must have discernible text (2 instances)

  Full report: https://accessiguard.app/scan?url=example.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Colors (ANSI)
- Score >= 90: Green
- Score 70-89: Yellow
- Score 50-69: Orange (use yellow)
- Score < 50: Red

## Exit Codes
- 0: Scan completed, score >= threshold
- 1: Scan completed, score < threshold
- 2: Error (network, invalid URL, etc.)

## package.json
```json
{
  "name": "accessiguard",
  "version": "1.0.0",
  "description": "Scan any website for accessibility issues from your terminal",
  "bin": {
    "accessiguard": "./bin/accessiguard.js"
  },
  "keywords": ["accessibility", "a11y", "wcag", "ada", "compliance", "scanner", "cli"],
  "author": "Zdenek Spacek <muqmuq@me.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/PrimeStark/accessiguard-cli"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": ["bin/"]
}
```

## README sections
1. Quick start (`npx accessiguard scan <url>`)
2. Installation (`npm i -g accessiguard`)
3. CI/CD integration (GitHub Actions example)
4. Options reference
5. Link to accessiguard.app
