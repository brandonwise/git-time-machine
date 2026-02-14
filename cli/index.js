#!/usr/bin/env node

/**
 * Git Time Machine — Unified CLI
 * 
 * One tool to understand any Git repository.
 */

import { program } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { authorsCommand } from './commands/authors.js';
import { flagsCommand } from './commands/flags.js';
import { bloatCommand } from './commands/bloat.js';
import { visualizeCommand } from './commands/visualize.js';
import { ciCommand } from './commands/ci.js';

const VERSION = '2.0.0';

program
  .name('gtm')
  .description('Git Time Machine — Understand any Git repository')
  .version(VERSION);

// Full analysis
program
  .command('analyze')
  .description('Run full repository analysis')
  .argument('[path]', 'Repository path', '.')
  .option('-o, --output <format>', 'Output format (text, json, html)', 'text')
  .option('--no-cache', 'Skip cache, force fresh analysis')
  .option('--include <modules>', 'Include specific modules (authors,flags,bloat,secrets)', 'all')
  .action(analyzeCommand);

// Author analysis (authorsync)
program
  .command('authors')
  .description('Detect duplicate authors, generate .mailmap')
  .argument('[path]', 'Repository path', '.')
  .option('-o, --output <format>', 'Output format (text, json, mailmap)', 'text')
  .option('--threshold <n>', 'Similarity threshold (0-100)', '70')
  .option('--apply', 'Apply .mailmap to repository')
  .option('--interactive', 'Interactive mode for ambiguous matches')
  .action(authorsCommand);

// Feature flag analysis (flagsweep)
program
  .command('flags')
  .description('Find stale feature flags')
  .argument('[path]', 'Path to scan', '.')
  .option('-o, --output <format>', 'Output format (text, json, diff)', 'text')
  .option('--stale-only', 'Show only stale flags')
  .option('--diff', 'Generate cleanup diffs')
  .option('--days <n>', 'Stale threshold in days', '90')
  .action(flagsCommand);

// Bloat analysis (gitfat)
program
  .command('bloat')
  .description('Find large files bloating repository history')
  .argument('[path]', 'Repository path', '.')
  .option('-o, --output <format>', 'Output format (text, json)', 'text')
  .option('-l, --limit <n>', 'Number of files to show', '20')
  .option('--include-deleted', 'Include deleted files still in history')
  .option('--min-size <bytes>', 'Minimum size to report', '1048576')
  .action(bloatCommand);

// Web visualization
program
  .command('visualize')
  .alias('viz')
  .alias('ui')
  .description('Launch web UI for visualization')
  .argument('[path]', 'Repository path', '.')
  .option('-p, --port <port>', 'Port for web server', '5173')
  .option('--no-open', 'Do not open browser')
  .action(visualizeCommand);

// CI mode
program
  .command('ci')
  .description('CI mode — JSON output, exit codes for issues')
  .argument('[path]', 'Repository path', '.')
  .option('--fail-on-secrets', 'Exit 1 if secrets found')
  .option('--fail-on-stale-flags', 'Exit 1 if stale flags found')
  .option('--fail-on-bloat <mb>', 'Exit 1 if any file exceeds size (MB)')
  .option('--fail-on-duplicates', 'Exit 1 if duplicate authors found')
  .action(ciCommand);

program.parse();
