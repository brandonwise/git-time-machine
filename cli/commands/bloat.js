/**
 * Bloat command — Find large files in repository history
 * 
 * Integrated from gitfat
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import {
  printHeader,
  printSubheader,
  printTable,
  printSuccess,
  printWarning,
  printError,
  printKV,
  outputJSON,
  formatBytes,
  c,
  createSpinner
} from '../lib/output.js';
import { isGitRepo, getRepoRoot } from '../lib/git.js';

// ============================================================================
// Analysis (from gitfat/analyzer.js)
// ============================================================================

/**
 * Get all objects in repository with their sizes
 */
function getAllObjects(repoPath, includeDeleted = false) {
  const objects = [];
  
  // Get all objects from rev-list
  const cmd = includeDeleted
    ? 'git rev-list --objects --all'
    : 'git rev-list --objects HEAD';
  
  try {
    const output = execSync(cmd, {
      cwd: repoPath,
      encoding: 'utf8',
      maxBuffer: 200 * 1024 * 1024 // 200MB
    });
    
    const lines = output.trim().split('\n');
    const hashToPath = new Map();
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        hashToPath.set(parts[0], parts.slice(1).join(' '));
      } else if (parts.length === 1) {
        hashToPath.set(parts[0], '');
      }
    }
    
    // Get sizes using cat-file
    const hashes = [...hashToPath.keys()];
    const batchSize = 500;
    
    for (let i = 0; i < hashes.length; i += batchSize) {
      const batch = hashes.slice(i, i + batchSize);
      const input = batch.join('\n');
      
      try {
        const sizeOutput = execSync('git cat-file --batch-check="%(objectsize) %(objectname)"', {
          cwd: repoPath,
          encoding: 'utf8',
          input,
          maxBuffer: 50 * 1024 * 1024
        });
        
        for (const line of sizeOutput.trim().split('\n')) {
          const [size, hash] = line.split(' ');
          const sizeNum = parseInt(size, 10);
          if (!isNaN(sizeNum) && hash) {
            objects.push({
              hash,
              path: hashToPath.get(hash) || '(unknown)',
              size: sizeNum
            });
          }
        }
      } catch {
        // Skip batch errors
      }
    }
    
    return objects.sort((a, b) => b.size - a.size);
  } catch (err) {
    throw new Error(`Failed to get objects: ${err.message}`);
  }
}

/**
 * Check if object still exists in HEAD
 */
function isInHead(repoPath, hash) {
  try {
    execSync(`git cat-file -e HEAD:${hash}`, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get .git directory size
 */
function getGitDirSize(repoPath) {
  try {
    const output = execSync('du -sk .git', {
      cwd: repoPath,
      encoding: 'utf8'
    });
    return parseInt(output.split('\t')[0], 10) * 1024;
  } catch {
    return 0;
  }
}

/**
 * Get working directory size (excluding .git)
 */
function getWorkingDirSize(repoPath) {
  try {
    // macOS-compatible: find all files, exclude .git, sum sizes
    const output = execSync(
      "find . -path './.git' -prune -o -type f -print0 | xargs -0 stat -f '%z' 2>/dev/null | awk '{s+=$1} END {print s}'",
      {
        cwd: repoPath,
        encoding: 'utf8',
        shell: true
      }
    );
    return parseInt(output.trim() || '0', 10);
  } catch {
    // Fallback: just report 0 if we can't measure
    return 0;
  }
}

/**
 * Categorize file by extension
 */
function categorizeFile(path) {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  
  const categories = {
    binary: ['exe', 'dll', 'so', 'dylib', 'bin', 'obj', 'o', 'a'],
    archive: ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'tgz'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'psd', 'svg', 'webp', 'ico'],
    video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv'],
    audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
    data: ['db', 'sqlite', 'sql', 'csv', 'json', 'xml', 'parquet'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
    package: ['jar', 'war', 'ear', 'whl', 'gem', 'nupkg'],
    nodemodules: ['node_modules'],
    log: ['log']
  };
  
  for (const [category, exts] of Object.entries(categories)) {
    if (exts.includes(ext) || path.includes(category)) {
      return category;
    }
  }
  
  return 'other';
}

/**
 * Generate recommendations based on findings
 */
function generateRecommendations(objects, gitDirSize, workingDirSize) {
  const recommendations = [];
  const largeObjects = objects.filter(o => o.size > 10 * 1024 * 1024); // > 10MB
  
  // Check for common bloat patterns
  const hasNodeModules = objects.some(o => o.path.includes('node_modules'));
  const hasVendor = objects.some(o => o.path.includes('vendor/'));
  const hasLargeMedia = objects.some(o => 
    o.size > 5 * 1024 * 1024 && 
    ['image', 'video', 'audio'].includes(categorizeFile(o.path))
  );
  const hasPackages = objects.some(o =>
    o.size > 1024 * 1024 &&
    ['package', 'archive'].includes(categorizeFile(o.path))
  );
  
  if (hasNodeModules) {
    recommendations.push('⚠️  node_modules in history — use git-filter-repo to remove');
  }
  if (hasVendor) {
    recommendations.push('⚠️  vendor/ directory in history — consider removing');
  }
  if (hasLargeMedia) {
    recommendations.push('⚠️  Large media files detected — consider Git LFS');
  }
  if (hasPackages) {
    recommendations.push('⚠️  Package files in history — use artifact storage instead');
  }
  
  if (gitDirSize > workingDirSize * 3) {
    recommendations.push('⚠️  .git directory is 3x larger than working directory');
    recommendations.push('   Run: git gc --aggressive --prune=now');
  }
  
  if (largeObjects.length > 10) {
    recommendations.push(`💡 ${largeObjects.length} objects over 10MB — consider git-filter-repo cleanup`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push('✅ Repository looks healthy!');
  }
  
  return recommendations;
}

// ============================================================================
// Command Handler
// ============================================================================

export async function bloatCommand(path, options) {
  const repoPath = resolve(path);
  
  if (!isGitRepo(repoPath)) {
    printError(`Not a git repository: ${repoPath}`);
    process.exit(1);
  }
  
  const spinner = createSpinner('Analyzing repository objects...');
  
  try {
    const includeDeleted = options.includeDeleted || false;
    const limit = parseInt(options.limit || '20', 10);
    const minSize = parseInt(options.minSize || '1048576', 10); // 1MB default
    
    // Get all objects
    const objects = getAllObjects(repoPath, includeDeleted);
    spinner.update('Calculating sizes...');
    
    // Filter by min size
    const filteredObjects = objects.filter(o => o.size >= minSize);
    
    // Get directory sizes
    const gitDirSize = getGitDirSize(repoPath);
    const workingDirSize = getWorkingDirSize(repoPath);
    const totalObjectSize = objects.reduce((sum, o) => sum + o.size, 0);
    
    // Generate recommendations
    const recommendations = generateRecommendations(objects, gitDirSize, workingDirSize);
    
    spinner.stop();
    
    // JSON output
    if (options.output === 'json') {
      outputJSON({
        stats: {
          gitDirSize,
          workingDirSize,
          totalObjectSize,
          objectCount: objects.length,
          largeObjectCount: filteredObjects.length,
          ratio: (gitDirSize / workingDirSize).toFixed(2)
        },
        largestFiles: filteredObjects.slice(0, limit).map(o => ({
          ...o,
          category: categorizeFile(o.path)
        })),
        recommendations
      });
      return;
    }
    
    // Text output
    printHeader('Repository Bloat Analysis');
    
    printSubheader('Size Summary');
    printKV('.git directory', formatBytes(gitDirSize));
    printKV('Working directory', formatBytes(workingDirSize));
    printKV('Ratio', `${(gitDirSize / workingDirSize).toFixed(1)}x`);
    printKV('Total objects', objects.length.toLocaleString());
    printKV('Objects over ' + formatBytes(minSize), filteredObjects.length);
    
    if (filteredObjects.length > 0) {
      printSubheader('Largest Files');
      console.log();
      
      const rows = filteredObjects.slice(0, limit).map(o => [
        o.path.length > 50 ? '...' + o.path.slice(-47) : o.path,
        formatBytes(o.size),
        categorizeFile(o.path)
      ]);
      
      printTable(
        ['Path', 'Size', 'Category'],
        rows,
        { alignRight: [1] }
      );
      
      if (filteredObjects.length > limit) {
        console.log();
        printWarning(`...and ${filteredObjects.length - limit} more large files`);
      }
    }
    
    // Category breakdown
    const categories = new Map();
    for (const obj of objects) {
      const cat = categorizeFile(obj.path);
      categories.set(cat, (categories.get(cat) || 0) + obj.size);
    }
    
    const sortedCategories = [...categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([_, size]) => size > 1024 * 1024);
    
    if (sortedCategories.length > 0) {
      printSubheader('Size by Category');
      console.log();
      
      const rows = sortedCategories.map(([cat, size]) => [
        cat,
        formatBytes(size),
        `${((size / totalObjectSize) * 100).toFixed(1)}%`
      ]);
      
      printTable(['Category', 'Size', 'Share'], rows, { alignRight: [1, 2] });
    }
    
    // Recommendations
    printSubheader('Recommendations');
    console.log();
    for (const rec of recommendations) {
      console.log('  ' + rec);
    }
    
  } catch (err) {
    spinner.stop();
    printError(`Failed to analyze repository: ${err.message}`);
    process.exit(1);
  }
}
