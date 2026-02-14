/**
 * Analyze command — Full repository analysis
 * 
 * Orchestrates all analysis modules
 */

import { resolve } from 'path';
import {
  printHeader,
  printSubheader,
  printKV,
  printSuccess,
  printWarning,
  printError,
  outputJSON,
  formatBytes,
  formatRelativeTime,
  c,
  createSpinner
} from '../lib/output.js';
import { isGitRepo, getRepoStats, getRemoteUrl, parseGitHubUrl } from '../lib/git.js';
import { authorsCommand } from './authors.js';
import { flagsCommand } from './flags.js';
import { bloatCommand } from './bloat.js';

// ============================================================================
// Command Handler
// ============================================================================

export async function analyzeCommand(path, options) {
  const repoPath = resolve(path);
  
  if (!isGitRepo(repoPath)) {
    printError(`Not a git repository: ${repoPath}`);
    process.exit(1);
  }
  
  const spinner = createSpinner('Analyzing repository...');
  
  try {
    // Get basic stats
    const stats = getRepoStats(repoPath);
    const remoteUrl = getRemoteUrl(repoPath);
    const github = parseGitHubUrl(remoteUrl);
    
    spinner.stop();
    
    // JSON output
    if (options.output === 'json') {
      const result = {
        repo: {
          path: repoPath,
          remote: remoteUrl,
          github
        },
        stats: {
          commits: stats.commits,
          contributors: stats.contributors,
          files: stats.files,
          firstCommit: stats.firstCommit,
          lastCommit: stats.lastCommit,
          ageInDays: Math.floor((Date.now() / 1000 - stats.firstCommit) / 86400)
        }
      };
      
      outputJSON(result);
      return;
    }
    
    // Text output - overview
    printHeader('Git Time Machine — Repository Analysis');
    
    printSubheader('Repository');
    if (github) {
      printKV('Name', `${github.owner}/${github.repo}`);
    }
    printKV('Path', repoPath);
    if (remoteUrl) {
      printKV('Remote', remoteUrl);
    }
    
    printSubheader('Statistics');
    printKV('Total commits', stats.commits.toLocaleString());
    printKV('Contributors', stats.contributors.toLocaleString());
    printKV('Tracked files', stats.files.toLocaleString());
    printKV('First commit', formatRelativeTime(stats.firstCommit));
    printKV('Last commit', formatRelativeTime(stats.lastCommit));
    
    // Parse include modules
    const modules = options.include === 'all' 
      ? ['authors', 'flags', 'bloat']
      : options.include.split(',').map(m => m.trim());
    
    console.log();
    console.log(c('dim', '─'.repeat(60)));
    
    // Run each module
    for (const mod of modules) {
      console.log();
      
      switch (mod) {
        case 'authors':
          console.log(c('cyan', '▶ Running author analysis...'));
          console.log();
          await authorsCommand(repoPath, { output: 'text', threshold: '70' });
          break;
          
        case 'flags':
          console.log(c('cyan', '▶ Running feature flag scan...'));
          console.log();
          await flagsCommand(repoPath, { output: 'text' });
          break;
          
        case 'bloat':
          console.log(c('cyan', '▶ Running bloat analysis...'));
          console.log();
          await bloatCommand(repoPath, { output: 'text', limit: '10' });
          break;
          
        default:
          printWarning(`Unknown module: ${mod}`);
      }
      
      console.log();
      console.log(c('dim', '─'.repeat(60)));
    }
    
    console.log();
    printSuccess('Analysis complete!');
    printKV('Web UI', 'gtm visualize');
    
  } catch (err) {
    spinner.stop();
    printError(`Analysis failed: ${err.message}`);
    process.exit(1);
  }
}
