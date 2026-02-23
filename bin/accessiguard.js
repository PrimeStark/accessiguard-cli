#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const API_URL = 'https://www.accessiguard.app/api/scan';
const EXIT_OK = 0;
const EXIT_THRESHOLD_FAIL = 1;
const EXIT_ERROR = 2;

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function color(text, code) {
  return `${code}${text}${ANSI.reset}`;
}

function getVersion() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function printHelp() {
  const help = [
    'accessiguard - Scan websites for 39 WCAG accessibility issues',
    '',
    'Usage:',
    '  accessiguard scan <url> [options]',
    '',
    'Commands:',
    '  scan <url>              Scan a URL for accessibility issues',
    '',
    'Options:',
    '  --threshold <number>    Minimum score to pass (default: 0, CI default: 70)',
    '  --json                  Output raw JSON response',
    '  --ci                    CI mode (minimal output)',
    '  --help                  Show help',
    '  --version               Show version',
    '',
    'Exit codes:',
    '  0  Score >= threshold',
    '  1  Score < threshold',
    '  2  Error (invalid input, network, API failure)'
  ];

  console.log(help.join('\n'));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    command: null,
    targetUrl: null,
    threshold: undefined,
    json: false,
    ci: false,
    help: false,
    version: false
  };

  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--help') {
      parsed.help = true;
      continue;
    }

    if (arg === '--version') {
      parsed.version = true;
      continue;
    }

    if (arg === '--json') {
      parsed.json = true;
      continue;
    }

    if (arg === '--ci') {
      parsed.ci = true;
      continue;
    }

    if (arg === '--threshold') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --threshold');
      }
      i += 1;
      const threshold = Number(value);
      if (!Number.isFinite(threshold)) {
        throw new Error('Invalid --threshold value. Expected a number.');
      }
      parsed.threshold = threshold;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  if (positionals.length > 0) {
    parsed.command = positionals[0];
  }

  if (positionals.length > 1) {
    parsed.targetUrl = positionals[1];
  }

  return parsed;
}

function validateHttpUrl(input) {
  let urlString = input;
  
  // Auto-prepend https:// if no protocol provided
  if (!/^https?:\/\//i.test(urlString)) {
    urlString = 'https://' + urlString;
  }
  
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must start with http:// or https://');
  }

  return parsed;
}

function clampScore(score) {
  if (!Number.isFinite(score)) {
    return 0;
  }
  if (score < 0) return 0;
  if (score > 100) return 100;
  return Math.round(score);
}

function getScoreColor(score) {
  if (score >= 90) return ANSI.green;
  if (score >= 50) return ANSI.yellow;
  return ANSI.red;
}

function getScoreLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs Improvement';
  return 'Poor';
}

function makeProgressBar(score, width = 24) {
  const filled = Math.round((score / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

function normalizeViolations(payload) {
  if (Array.isArray(payload.violations)) return payload.violations;
  if (Array.isArray(payload.issues)) return payload.issues;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function countBySeverity(violations, fallbackCounts) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };

  if (fallbackCounts && typeof fallbackCounts === 'object') {
    for (const key of Object.keys(counts)) {
      const value = Number(fallbackCounts[key]);
      if (Number.isFinite(value) && value >= 0) {
        counts[key] = Math.round(value);
      }
    }
  }

  if (violations.length === 0) {
    return counts;
  }

  const derived = { critical: 0, serious: 0, moderate: 0, minor: 0 };

  for (const issue of violations) {
    const raw = String(issue.impact || issue.severity || issue.level || '').toLowerCase();
    const sev = Object.prototype.hasOwnProperty.call(derived, raw) ? raw : 'minor';
    const issueCount = Number.isFinite(Number(issue.count))
      ? Math.max(1, Math.round(Number(issue.count)))
      : Array.isArray(issue.nodes)
        ? Math.max(1, issue.nodes.length)
        : 1;
    derived[sev] += issueCount;
  }

  return derived;
}

function pickTopIssues(violations, limit = 3) {
  return [...violations]
    .map((issue) => {
      const count = Number.isFinite(Number(issue.count))
        ? Math.max(1, Math.round(Number(issue.count)))
        : Array.isArray(issue.nodes)
          ? Math.max(1, issue.nodes.length)
          : 1;

      return {
        severity: String(issue.impact || issue.severity || issue.level || 'minor').toLowerCase(),
        title: issue.description || issue.help || issue.message || issue.rule || 'Unknown issue',
        count
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function resolveScore(payload) {
  const direct = Number(payload.score);
  if (Number.isFinite(direct)) return clampScore(direct);

  const nested = Number(payload.result && payload.result.score);
  if (Number.isFinite(nested)) return clampScore(nested);

  const pct = Number(payload.percentage);
  if (Number.isFinite(pct)) return clampScore(pct);

  return 0;
}

function resolveReportUrl(payload, targetUrl) {
  // v2 API returns scanId + relative reportUrl
  if (payload.scanId) {
    return `https://www.accessiguard.app/scan/${payload.scanId}`;
  }
  const explicit = payload.reportUrl || payload.report_url || payload.report;
  if (typeof explicit === 'string' && explicit.length > 0) {
    if (explicit.startsWith('/')) {
      return `https://www.accessiguard.app${explicit}`;
    }
    return explicit;
  }
  return `https://www.accessiguard.app/scan?url=${encodeURIComponent(targetUrl)}`;
}

function resolveTotalIssues(violations, counts, payload) {
  // v2 API response includes issueCount directly
  const fromPayload = Number(payload.issueCount);
  if (Number.isFinite(fromPayload) && fromPayload >= 0 && violations.length === 0) {
    return Math.round(fromPayload);
  }
  return counts.critical + counts.serious + counts.moderate + counts.minor;
}

function printPrettyReport(targetUrl, payload) {
  const score = resolveScore(payload);
  const scoreColor = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);
  const violations = normalizeViolations(payload);
  const counts = countBySeverity(violations, payload.counts);
  const totalIssues = resolveTotalIssues(violations, counts, payload);
  const top = pickTopIssues(violations, 3);
  const reportUrl = resolveReportUrl(payload, targetUrl);
  const line = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  console.log(`${color('Scanning', ANSI.cyan)} ${targetUrl}...\n`);
  console.log(color(line, ANSI.gray));
  console.log(`  ${color('AccessiGuard Accessibility Report', ANSI.bold)}`);
  console.log(color(line, ANSI.gray));
  console.log('');
  console.log(
    `  Score: ${color(`${score}/100`, scoreColor)} ${color(makeProgressBar(score), scoreColor)} ${color(scoreLabel, scoreColor)}`
  );
  console.log('');
  console.log(`  Issues Found: ${totalIssues}`);

  if (violations.length > 0) {
    console.log(`  ├─ Critical: ${color(String(counts.critical), ANSI.red)}`);
    console.log(`  ├─ Serious: ${color(String(counts.serious), ANSI.yellow)}`);
    console.log(`  ├─ Moderate: ${color(String(counts.moderate), ANSI.yellow)}`);
    console.log(`  └─ Minor: ${color(String(counts.minor), ANSI.gray)}`);
  }

  console.log('');

  if (top.length > 0) {
    console.log('  Top Issues:');
    for (let i = 0; i < top.length; i += 1) {
      const issue = top[i];
      console.log(`  ${i + 1}. [${issue.severity}] ${issue.title} (${issue.count} instance${issue.count === 1 ? '' : 's'})`);
    }
  } else {
    console.log(`  See full report for issue details.`);
  }

  const moreIssues = Number(payload.moreIssues);
  if (Number.isFinite(moreIssues) && moreIssues > 0) {
    console.log('');
    console.log(color(`  + ${moreIssues} more issue${moreIssues === 1 ? '' : 's'} — view full report for details + AI fix suggestions`, ANSI.yellow));
  }

  console.log('');
  console.log(`  Full report: ${color(reportUrl, ANSI.cyan)}`);
  console.log(color(line, ANSI.gray));
}

function printCiOutput(score, threshold) {
  const state = score >= threshold ? 'PASS' : 'FAIL';
  console.log(`${state} score=${score} threshold=${threshold}`);
}

async function scan(targetUrl) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ url: targetUrl })
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`API returned invalid JSON (HTTP ${response.status})`);
  }

  if (!response.ok) {
    const message = data && typeof data.error === 'string' ? data.error : `Scan failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function main() {
  try {
    const parsed = parseArgs(process.argv);

    if (parsed.version) {
      console.log(getVersion());
      process.exit(EXIT_OK);
    }

    if (parsed.help || !parsed.command) {
      printHelp();
      process.exit(EXIT_OK);
    }

    if (parsed.command !== 'scan') {
      throw new Error(`Unknown command: ${parsed.command}`);
    }

    if (!parsed.targetUrl) {
      throw new Error('Missing URL. Usage: accessiguard scan <url>');
    }

    const normalizedUrl = validateHttpUrl(parsed.targetUrl).toString();
    const threshold = parsed.threshold !== undefined ? parsed.threshold : (parsed.ci ? 70 : 0);

    if (!Number.isFinite(threshold)) {
      throw new Error('Threshold must be a valid number.');
    }

    const data = await scan(normalizedUrl);
    const score = resolveScore(data);

    if (parsed.json) {
      console.log(JSON.stringify(data, null, 2));
    } else if (parsed.ci) {
      printCiOutput(score, threshold);
    } else {
      printPrettyReport(normalizedUrl, data);
    }

    const exitCode = score >= threshold ? EXIT_OK : EXIT_THRESHOLD_FAIL;
    process.exit(exitCode);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error(color(`Error: ${message}`, ANSI.red));
    process.exit(EXIT_ERROR);
  }
}

main();
