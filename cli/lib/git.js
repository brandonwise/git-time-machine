/**
 * Shared Git operations
 */

import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

/**
 * Verify path is a git repository
 */
export function isGitRepo(path) {
  const gitDir = join(resolve(path), '.git');
  return existsSync(gitDir);
}

/**
 * Get repository root directory
 */
export function getRepoRoot(path = '.') {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd: resolve(path),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get all commits with author info
 */
export function getCommits(path = '.', options = {}) {
  const { limit, since, until } = options;
  
  let cmd = 'git log --format="%H|%an|%ae|%at|%s"';
  if (limit) cmd += ` -n ${limit}`;
  if (since) cmd += ` --since="${since}"`;
  if (until) cmd += ` --until="${until}"`;
  
  try {
    const output = execSync(cmd, {
      cwd: resolve(path),
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024 // 50MB
    });
    
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [hash, name, email, timestamp, ...messageParts] = line.split('|');
      return {
        hash,
        author: { name, email },
        timestamp: parseInt(timestamp, 10),
        message: messageParts.join('|')
      };
    });
  } catch (err) {
    throw new Error(`Failed to get commits: ${err.message}`);
  }
}

/**
 * Get all unique authors from git log
 */
export function getAuthors(path = '.') {
  try {
    const output = execSync('git log --format="%an|%ae" | sort -u', {
      cwd: resolve(path),
      encoding: 'utf8',
      shell: true,
      maxBuffer: 10 * 1024 * 1024
    });
    
    return output.trim().split('\n').filter(Boolean).map(line => {
      const [name, email] = line.split('|');
      return { name, email };
    });
  } catch (err) {
    throw new Error(`Failed to get authors: ${err.message}`);
  }
}

/**
 * Get all blob objects with sizes
 */
export function getBlobs(path = '.', options = {}) {
  const { includeDeleted = false } = options;
  
  // Get all objects in history
  const cmd = includeDeleted
    ? 'git rev-list --all --objects'
    : 'git ls-tree -r HEAD';
  
  try {
    const output = execSync(cmd, {
      cwd: resolve(path),
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024
    });
    
    // Get sizes for each blob
    const blobs = [];
    const lines = output.trim().split('\n').filter(Boolean);
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const hash = includeDeleted ? parts[0] : parts[2];
      const filePath = includeDeleted ? parts.slice(1).join(' ') : parts[3];
      
      if (!hash || hash.length !== 40) continue;
      
      try {
        const size = parseInt(
          execSync(`git cat-file -s ${hash}`, {
            cwd: resolve(path),
            encoding: 'utf8'
          }).trim(),
          10
        );
        
        blobs.push({ hash, path: filePath, size });
      } catch {
        // Object might not exist, skip
      }
    }
    
    return blobs.sort((a, b) => b.size - a.size);
  } catch (err) {
    throw new Error(`Failed to get blobs: ${err.message}`);
  }
}

/**
 * Get remote origin URL
 */
export function getRemoteUrl(path = '.') {
  try {
    return execSync('git remote get-url origin', {
      cwd: resolve(path),
      encoding: 'utf8'
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get current branch name
 */
export function getCurrentBranch(path = '.') {
  try {
    return execSync('git branch --show-current', {
      cwd: resolve(path),
      encoding: 'utf8'
    }).trim();
  } catch {
    return 'main';
  }
}

/**
 * Parse GitHub URL to owner/repo
 */
export function parseGitHubUrl(url) {
  if (!url) return null;
  
  const patterns = [
    /github\.com[:/]([^/]+)\/([^/.]+)/,
    /github\.com[:/]([^/]+)\/([^/.]+)\.git/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }
  
  return null;
}

/**
 * Get basic repo stats
 */
export function getRepoStats(path = '.') {
  const repoPath = resolve(path);
  
  try {
    const commitCount = parseInt(
      execSync('git rev-list --count HEAD', { cwd: repoPath, encoding: 'utf8' }).trim(),
      10
    );
    
    const contributorCount = parseInt(
      execSync('git shortlog -sn HEAD | wc -l', { cwd: repoPath, encoding: 'utf8', shell: true }).trim(),
      10
    );
    
    const fileCount = parseInt(
      execSync('git ls-files | wc -l', { cwd: repoPath, encoding: 'utf8', shell: true }).trim(),
      10
    );
    
    const firstCommit = execSync('git log --reverse --format="%at" | head -1', {
      cwd: repoPath,
      encoding: 'utf8',
      shell: true
    }).trim();
    
    const lastCommit = execSync('git log -1 --format="%at"', {
      cwd: repoPath,
      encoding: 'utf8'
    }).trim();
    
    return {
      commits: commitCount,
      contributors: contributorCount,
      files: fileCount,
      firstCommit: parseInt(firstCommit, 10),
      lastCommit: parseInt(lastCommit, 10)
    };
  } catch (err) {
    throw new Error(`Failed to get repo stats: ${err.message}`);
  }
}
