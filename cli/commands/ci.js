/**
 * CI command — JSON output with exit codes for CI/CD integration
 */

import { resolve } from 'path';
import { execSync } from 'child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { isGitRepo, getRepoStats, getAuthors } from '../lib/git.js';

// ============================================================================
// Scanners (simplified versions for CI)
// ============================================================================

async function scanSecrets(repoPath) {
  // Check if gitleaks is available
  try {
    execSync('which gitleaks', { stdio: 'pipe' });
  } catch {
    return { available: false, findings: [] };
  }
  
  try {
    const output = execSync('gitleaks detect --no-git -f json 2>/dev/null || true', {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    
    const findings = output.trim() ? JSON.parse(output) : [];
    return { available: true, findings };
  } catch {
    return { available: true, findings: [] };
  }
}

async function scanDuplicateAuthors(repoPath, threshold = 0.7) {
  try {
    const output = execSync('git shortlog -sne HEAD', {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    
    const authors = [];
    for (const line of output.trim().split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.+)\s+<(.+)>$/);
      if (match) {
        authors.push({
          commits: parseInt(match[1], 10),
          name: match[2].trim(),
          email: match[3].trim()
        });
      }
    }
    
    // Simple duplicate detection
    const duplicates = [];
    const seen = new Map();
    
    for (const author of authors) {
      const key = author.email.toLowerCase().split('@')[0];
      if (seen.has(key)) {
        duplicates.push({
          canonical: seen.get(key),
          alias: author
        });
      } else {
        seen.set(key, author);
      }
    }
    
    return duplicates;
  } catch {
    return [];
  }
}

async function scanStaleFlags(targetPath) {
  const patterns = [
    /FEATURE_\w+\s*=\s*(true|false)/gi,
    /enable_\w+\s*[=:]\s*(true|false)/gi,
  ];
  
  const staleFlags = [];
  const extensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go'];
  const ignoreDirs = ['node_modules', '.git', 'vendor', 'dist', 'build'];
  
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory() && !ignoreDirs.includes(entry.name)) {
        await walk(fullPath);
      } else if (entry.isFile() && extensions.includes(extname(entry.name).slice(1))) {
        try {
          const content = await readFile(fullPath, 'utf-8');
          for (const pattern of patterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(content)) !== null) {
              staleFlags.push({
                flag: match[0].split(/[=:]/)[0].trim(),
                value: match[1],
                file: relative(targetPath, fullPath)
              });
            }
          }
        } catch {
          // Skip
        }
      }
    }
  }
  
  try {
    await walk(targetPath);
    return staleFlags;
  } catch {
    return [];
  }
}

function scanLargeFiles(repoPath, maxSizeMB = 10) {
  const maxBytes = maxSizeMB * 1024 * 1024;
  const largeFiles = [];
  
  try {
    const output = execSync('git ls-tree -r -l HEAD', {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024
    });
    
    for (const line of output.trim().split('\n')) {
      const parts = line.split(/\s+/);
      if (parts.length >= 5) {
        const size = parseInt(parts[3], 10);
        const path = parts.slice(4).join(' ');
        
        if (size > maxBytes) {
          largeFiles.push({ path, size, sizeMB: (size / 1024 / 1024).toFixed(2) });
        }
      }
    }
    
    return largeFiles.sort((a, b) => b.size - a.size);
  } catch {
    return [];
  }
}

// ============================================================================
// Command Handler
// ============================================================================

export async function ciCommand(path, options) {
  const repoPath = resolve(path);
  
  if (!isGitRepo(repoPath)) {
    console.error(JSON.stringify({ error: `Not a git repository: ${repoPath}` }));
    process.exit(1);
  }
  
  const results = {
    repository: repoPath,
    timestamp: new Date().toISOString(),
    checks: {},
    exitCode: 0
  };
  
  // Run checks
  
  // 1. Secrets
  if (options.failOnSecrets) {
    const secrets = await scanSecrets(repoPath);
    results.checks.secrets = {
      available: secrets.available,
      count: secrets.findings.length,
      findings: secrets.findings.slice(0, 10)
    };
    
    if (secrets.findings.length > 0) {
      results.exitCode = 1;
    }
  }
  
  // 2. Duplicate authors
  if (options.failOnDuplicates) {
    const duplicates = await scanDuplicateAuthors(repoPath);
    results.checks.duplicateAuthors = {
      count: duplicates.length,
      duplicates: duplicates.slice(0, 10)
    };
    
    if (duplicates.length > 0) {
      results.exitCode = 1;
    }
  }
  
  // 3. Stale flags
  if (options.failOnStaleFlags) {
    const staleFlags = await scanStaleFlags(repoPath);
    results.checks.staleFlags = {
      count: staleFlags.length,
      flags: staleFlags.slice(0, 20)
    };
    
    if (staleFlags.length > 0) {
      results.exitCode = 1;
    }
  }
  
  // 4. Large files
  if (options.failOnBloat) {
    const maxSizeMB = parseFloat(options.failOnBloat);
    const largeFiles = scanLargeFiles(repoPath, maxSizeMB);
    results.checks.largeFiles = {
      threshold: `${maxSizeMB}MB`,
      count: largeFiles.length,
      files: largeFiles.slice(0, 10)
    };
    
    if (largeFiles.length > 0) {
      results.exitCode = 1;
    }
  }
  
  // If no checks specified, run all
  if (Object.keys(results.checks).length === 0) {
    const secrets = await scanSecrets(repoPath);
    const duplicates = await scanDuplicateAuthors(repoPath);
    const staleFlags = await scanStaleFlags(repoPath);
    const largeFiles = scanLargeFiles(repoPath, 50);
    
    results.checks = {
      secrets: {
        available: secrets.available,
        count: secrets.findings.length,
        findings: secrets.findings.slice(0, 10)
      },
      duplicateAuthors: {
        count: duplicates.length,
        duplicates: duplicates.slice(0, 10)
      },
      staleFlags: {
        count: staleFlags.length,
        flags: staleFlags.slice(0, 20)
      },
      largeFiles: {
        threshold: '50MB',
        count: largeFiles.length,
        files: largeFiles.slice(0, 10)
      }
    };
  }
  
  // Add summary
  results.summary = {
    pass: results.exitCode === 0,
    issues: Object.values(results.checks).reduce((sum, check) => sum + (check.count || 0), 0)
  };
  
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.exitCode);
}
