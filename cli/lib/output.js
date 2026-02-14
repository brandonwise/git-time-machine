/**
 * Shared output formatters
 */

import { writeFileSync } from 'fs';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

// Check if colors should be disabled
const noColor = process.env.NO_COLOR || !process.stdout.isTTY;

function c(color, text) {
  if (noColor) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format timestamp to relative time
 */
export function formatRelativeTime(timestamp) {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

/**
 * Format date
 */
export function formatDate(timestamp) {
  return new Date(timestamp * 1000).toISOString().split('T')[0];
}

/**
 * Print section header
 */
export function printHeader(title) {
  console.log();
  console.log(c('cyan', '━'.repeat(60)));
  console.log(c('bold', `  ${title}`));
  console.log(c('cyan', '━'.repeat(60)));
}

/**
 * Print subheader
 */
export function printSubheader(title) {
  console.log();
  console.log(c('bold', `▸ ${title}`));
}

/**
 * Print key-value pair
 */
export function printKV(key, value, indent = 0) {
  const padding = '  '.repeat(indent);
  console.log(`${padding}${c('dim', key + ':')} ${value}`);
}

/**
 * Print success message
 */
export function printSuccess(message) {
  console.log(c('green', `✓ ${message}`));
}

/**
 * Print warning message
 */
export function printWarning(message) {
  console.log(c('yellow', `⚠ ${message}`));
}

/**
 * Print error message
 */
export function printError(message) {
  console.error(c('red', `✗ ${message}`));
}

/**
 * Print info message
 */
export function printInfo(message) {
  console.log(c('blue', `ℹ ${message}`));
}

/**
 * Print table
 */
export function printTable(headers, rows, options = {}) {
  const { alignRight = [] } = options;
  
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map(r => String(r[i] || '').length));
    return Math.max(h.length, maxRow);
  });
  
  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  console.log(c('bold', headerLine));
  console.log(c('dim', '─'.repeat(headerLine.length)));
  
  // Print rows
  for (const row of rows) {
    const line = row.map((cell, i) => {
      const str = String(cell || '');
      return alignRight.includes(i) ? str.padStart(widths[i]) : str.padEnd(widths[i]);
    }).join('  ');
    console.log(line);
  }
}

/**
 * Print progress bar
 */
export function printProgress(current, total, label = '') {
  const width = 40;
  const percent = Math.min(current / total, 1);
  const filled = Math.round(width * percent);
  const empty = width - filled;
  
  const bar = c('green', '█'.repeat(filled)) + c('dim', '░'.repeat(empty));
  const pct = `${Math.round(percent * 100)}%`;
  
  process.stdout.write(`\r${bar} ${pct} ${label}`);
  
  if (current >= total) {
    console.log();
  }
}

/**
 * Output as JSON
 */
export function outputJSON(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Write to file
 */
export function writeOutput(path, content) {
  writeFileSync(path, content, 'utf8');
  printSuccess(`Written to ${path}`);
}

/**
 * Create a spinner for async operations
 */
export function createSpinner(message) {
  if (noColor) {
    console.log(message);
    return { stop: () => {}, update: () => {} };
  }
  
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  
  const interval = setInterval(() => {
    process.stdout.write(`\r${c('cyan', frames[i])} ${message}`);
    i = (i + 1) % frames.length;
  }, 80);
  
  return {
    stop: (finalMessage) => {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(message.length + 3) + '\r');
      if (finalMessage) console.log(finalMessage);
    },
    update: (newMessage) => {
      message = newMessage;
    }
  };
}

export { c, colors };
