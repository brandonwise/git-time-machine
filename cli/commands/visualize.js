/**
 * Visualize command — Launch web UI
 */

import { spawn, execSync } from 'child_process';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import {
  printHeader,
  printSuccess,
  printError,
  printInfo,
  printKV,
  c
} from '../lib/output.js';
import { isGitRepo, getRemoteUrl, parseGitHubUrl } from '../lib/git.js';

// ============================================================================
// Command Handler
// ============================================================================

export async function visualizeCommand(path, options) {
  const repoPath = resolve(path);
  const port = options.port || '5173';
  const appDir = join(__dirname, '..', '..', 'app');
  
  if (!isGitRepo(repoPath)) {
    printError(`Not a git repository: ${repoPath}`);
    process.exit(1);
  }
  
  // Check if app directory exists
  if (!existsSync(appDir)) {
    printError('Web UI not found. Please install the full git-time-machine package.');
    printInfo('Run: npm install -g git-time-machine');
    process.exit(1);
  }
  
  // Get repo info
  const remoteUrl = getRemoteUrl(repoPath);
  const github = parseGitHubUrl(remoteUrl);
  
  printHeader('Git Time Machine — Web Visualization');
  
  if (github) {
    printKV('Repository', `${github.owner}/${github.repo}`);
  }
  printKV('Port', port);
  console.log();
  
  // Check if dependencies are installed
  const nodeModulesPath = join(appDir, 'node_modules');
  if (!existsSync(nodeModulesPath)) {
    printInfo('Installing dependencies...');
    try {
      execSync('pnpm install', { cwd: appDir, stdio: 'inherit' });
    } catch {
      try {
        execSync('npm install', { cwd: appDir, stdio: 'inherit' });
      } catch (err) {
        printError(`Failed to install dependencies: ${err.message}`);
        process.exit(1);
      }
    }
  }
  
  // Set environment variable with repo path
  const env = {
    ...process.env,
    GTM_REPO_PATH: repoPath,
    GTM_REPO_OWNER: github?.owner || '',
    GTM_REPO_NAME: github?.repo || ''
  };
  
  // Start dev server
  printInfo('Starting web server...');
  
  const devServer = spawn('pnpm', ['dev', '--port', port], {
    cwd: appDir,
    env,
    stdio: 'inherit'
  });
  
  devServer.on('error', (err) => {
    printError(`Failed to start server: ${err.message}`);
    process.exit(1);
  });
  
  // Open browser (unless --no-open)
  if (options.open !== false) {
    setTimeout(() => {
      const url = `http://localhost:${port}`;
      
      try {
        if (process.platform === 'darwin') {
          execSync(`open "${url}"`);
        } else if (process.platform === 'win32') {
          execSync(`start "${url}"`);
        } else {
          execSync(`xdg-open "${url}"`);
        }
        printSuccess(`Opened ${url} in browser`);
      } catch {
        printInfo(`Open ${url} in your browser`);
      }
    }, 2000);
  }
  
  console.log();
  printInfo('Press Ctrl+C to stop the server');
  
  // Handle shutdown
  process.on('SIGINT', () => {
    devServer.kill();
    process.exit(0);
  });
}
