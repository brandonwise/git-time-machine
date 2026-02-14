/**
 * Flags command — Find stale feature flags
 * 
 * Integrated from flagsweep
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative, resolve } from 'node:path';
import {
  printHeader,
  printSubheader,
  printTable,
  printSuccess,
  printWarning,
  printError,
  printInfo,
  printKV,
  outputJSON,
  c,
  createSpinner
} from '../lib/output.js';

// ============================================================================
// Patterns (from flagsweep/scanner.js)
// ============================================================================

const BUILTIN_PATTERNS = [
  // LaunchDarkly
  { pattern: /variation\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'launchdarkly' },
  { pattern: /ldClient\.variation\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'launchdarkly' },
  { pattern: /useFlags\s*\(\s*\)\s*\.\s*(\w+)/g, type: 'launchdarkly' },
  { pattern: /flags\.(\w+)/g, type: 'launchdarkly' },

  // Split.io
  { pattern: /getTreatment\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'split' },
  { pattern: /client\.getTreatment\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'split' },

  // Unleash
  { pattern: /isEnabled\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'unleash' },
  { pattern: /useFlag\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'unleash' },
  { pattern: /useVariant\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'unleash' },

  // Generic patterns
  { pattern: /featureFlag\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'generic' },
  { pattern: /isFeatureEnabled\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'generic' },
  { pattern: /checkFeature\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'generic' },
  { pattern: /hasFeature\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'generic' },
  { pattern: /getFeatureFlag\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'generic' },

  // Environment variables
  { pattern: /process\.env\.(FEATURE_\w+)/g, type: 'env' },
  { pattern: /process\.env\[['"`](FEATURE_\w+)['"`]\]/g, type: 'env' },

  // Constants
  { pattern: /const\s+(FEATURE_\w+)\s*=/g, type: 'constant' },
  { pattern: /(FEATURE_\w+)\s*=\s*(true|false)/g, type: 'constant' },
  { pattern: /(enable_\w+)\s*[=:]\s*(true|false)/gi, type: 'constant' },

  // Ruby/Flipper
  { pattern: /Flipper\.enabled\?\s*\(\s*:(\w+)/g, type: 'flipper' },

  // Python
  { pattern: /feature_flag\s*\(\s*['"`](\w+)['"`]/g, type: 'python' },
  { pattern: /is_feature_enabled\s*\(\s*['"`](\w+)['"`]/g, type: 'python' },

  // Go
  { pattern: /IsEnabled\s*\(\s*['"`](\w+)['"`]/g, type: 'go' },

  // Java
  { pattern: /isFeatureEnabled\s*\(\s*['"`]([^'"`]+)['"`]/g, type: 'java' },
];

const DEFAULT_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'java', 'kt', 'swift'];
const DEFAULT_IGNORE = ['node_modules', '.git', 'vendor', 'dist', 'build', '__pycache__', '.next'];

// ============================================================================
// Scanner
// ============================================================================

function detectConstantValue(content, flagName, lineNumber) {
  const lines = content.split('\n');
  const start = Math.max(0, lineNumber - 3);
  const end = Math.min(lines.length, lineNumber + 3);
  const context = lines.slice(start, end).join('\n');

  const truePatterns = [
    new RegExp(`${flagName}\\s*=\\s*true`, 'i'),
    new RegExp(`${flagName}\\s*:\\s*true`, 'i'),
  ];

  const falsePatterns = [
    new RegExp(`${flagName}\\s*=\\s*false`, 'i'),
    new RegExp(`${flagName}\\s*:\\s*false`, 'i'),
  ];

  for (const p of truePatterns) if (p.test(context)) return 'true';
  for (const p of falsePatterns) if (p.test(context)) return 'false';
  return null;
}

async function scanFile(filePath, basePath) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const relativePath = relative(basePath, filePath);
  const usages = [];

  for (const { pattern, type } of BUILTIN_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    
    while ((match = pattern.exec(content)) !== null) {
      const flagName = match[1] || match[0];
      if (flagName.length < 3) continue;
      if (/^(get|set|has|is|can|will|should)$/i.test(flagName)) continue;

      const beforeMatch = content.slice(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      const line = lines[lineNumber - 1] || '';
      const constantValue = detectConstantValue(content, flagName, lineNumber);

      usages.push({
        flagName: flagName.trim(),
        file: relativePath,
        line: lineNumber,
        context: line.trim().slice(0, 80),
        type,
        constantValue,
        stale: constantValue !== null
      });
    }
  }

  return usages;
}

async function scan(targetPath) {
  const usages = [];

  async function walkDir(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!DEFAULT_IGNORE.includes(entry.name)) {
          await walkDir(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).slice(1);
        if (DEFAULT_EXTENSIONS.includes(ext)) {
          try {
            const fileUsages = await scanFile(fullPath, targetPath);
            usages.push(...fileUsages);
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  const stats = await stat(targetPath);
  if (stats.isDirectory()) {
    await walkDir(targetPath);
  } else {
    const fileUsages = await scanFile(targetPath, targetPath);
    usages.push(...fileUsages);
  }

  return usages;
}

// ============================================================================
// Analysis
// ============================================================================

function analyzeFlags(usages) {
  // Group by flag name
  const flagGroups = new Map();
  
  for (const usage of usages) {
    if (!flagGroups.has(usage.flagName)) {
      flagGroups.set(usage.flagName, []);
    }
    flagGroups.get(usage.flagName).push(usage);
  }
  
  const flags = [];
  for (const [name, instances] of flagGroups) {
    const staleInstances = instances.filter(i => i.stale);
    const isStale = staleInstances.length > 0;
    
    flags.push({
      name,
      instances: instances.length,
      files: [...new Set(instances.map(i => i.file))],
      type: instances[0].type,
      stale: isStale,
      constantValue: isStale ? staleInstances[0].constantValue : null,
      usages: instances
    });
  }
  
  return flags.sort((a, b) => {
    if (a.stale !== b.stale) return a.stale ? -1 : 1;
    return b.instances - a.instances;
  });
}

// ============================================================================
// Diff Generation
// ============================================================================

function generateDiff(flag) {
  if (!flag.stale) return null;
  
  const lines = [];
  lines.push(`# Remove stale flag: ${flag.name} (hardcoded to ${flag.constantValue})`);
  lines.push(`# Files affected: ${flag.files.length}`);
  lines.push('');
  
  for (const usage of flag.usages) {
    if (!usage.stale) continue;
    lines.push(`--- a/${usage.file}`);
    lines.push(`+++ b/${usage.file}`);
    lines.push(`@@ -${usage.line},1 +${usage.line},0 @@`);
    lines.push(`-${usage.context}`);
    lines.push(`+# TODO: Remove flag "${flag.name}" (always ${flag.constantValue})`);
    lines.push('');
  }
  
  return lines.join('\n');
}

// ============================================================================
// Command Handler
// ============================================================================

export async function flagsCommand(path, options) {
  const targetPath = resolve(path);
  
  const spinner = createSpinner('Scanning for feature flags...');
  
  try {
    const usages = await scan(targetPath);
    spinner.update('Analyzing flags...');
    
    const flags = analyzeFlags(usages);
    const staleFlags = flags.filter(f => f.stale);
    const activeFlags = flags.filter(f => !f.stale);
    
    spinner.stop();
    
    // JSON output
    if (options.output === 'json') {
      outputJSON({
        stats: {
          totalFlags: flags.length,
          staleFlags: staleFlags.length,
          activeFlags: activeFlags.length,
          totalUsages: usages.length
        },
        stale: staleFlags,
        active: activeFlags
      });
      return;
    }
    
    // Diff output
    if (options.output === 'diff' || options.diff) {
      for (const flag of staleFlags) {
        const diff = generateDiff(flag);
        if (diff) console.log(diff);
      }
      return;
    }
    
    // Text output
    printHeader('Feature Flag Analysis');
    
    printSubheader('Summary');
    printKV('Total flags found', flags.length);
    printKV('Stale flags', staleFlags.length);
    printKV('Active flags', activeFlags.length);
    printKV('Total usages', usages.length);
    
    if (staleFlags.length > 0) {
      printSubheader('Stale Flags (hardcoded to true/false)');
      console.log();
      
      const rows = staleFlags.slice(0, 20).map(f => [
        f.name,
        f.constantValue,
        f.instances,
        f.files.length,
        f.type
      ]);
      
      printTable(
        ['Flag Name', 'Value', 'Usages', 'Files', 'Type'],
        rows,
        { alignRight: [2, 3] }
      );
      
      if (staleFlags.length > 20) {
        console.log();
        printInfo(`...and ${staleFlags.length - 20} more stale flags`);
      }
      
      console.log();
      printWarning(`Found ${staleFlags.length} stale feature flags that can be removed`);
      printInfo('Use --diff to generate cleanup patches');
    }
    
    if (!options.staleOnly && activeFlags.length > 0) {
      printSubheader('Active Flags');
      console.log();
      
      const rows = activeFlags.slice(0, 10).map(f => [
        f.name,
        f.instances,
        f.files.length,
        f.type
      ]);
      
      printTable(
        ['Flag Name', 'Usages', 'Files', 'Type'],
        rows,
        { alignRight: [1, 2] }
      );
      
      if (activeFlags.length > 10) {
        console.log();
        printInfo(`...and ${activeFlags.length - 10} more active flags`);
      }
    }
    
    if (flags.length === 0) {
      console.log();
      printSuccess('No feature flags found in the codebase');
    }
    
  } catch (err) {
    spinner.stop();
    printError(`Failed to scan for flags: ${err.message}`);
    process.exit(1);
  }
}
