/**
 * Authors command — Detect duplicate authors, generate .mailmap
 * 
 * Integrated from authorsync
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import {
  printHeader,
  printSubheader,
  printTable,
  printSuccess,
  printWarning,
  printError,
  printKV,
  outputJSON,
  c,
  createSpinner
} from '../lib/output.js';
import { isGitRepo, getRepoRoot } from '../lib/git.js';

// ============================================================================
// Identity Matching (from authorsync/matcher.js)
// ============================================================================

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function emailLocal(email) {
  return email.split('@')[0].toLowerCase();
}

function emailDomain(email) {
  const parts = email.split('@');
  return parts[1] ? parts[1].toLowerCase() : '';
}

function isNoReply(email) {
  const lower = email.toLowerCase();
  return (
    lower.includes('noreply') ||
    lower.includes('no-reply') ||
    lower.includes('@users.noreply.github.com') ||
    lower.includes('@users.noreply.gitlab.com') ||
    lower.includes('+')
  );
}

function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function nameSimilarity(name1, name2) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (n1 === n2) return 1;
  if (!n1 || !n2) return 0;
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;
  const words1 = new Set(n1.split(' '));
  const words2 = new Set(n2.split(' '));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  const jaccardSim = intersection.length / union.size;
  if (jaccardSim > 0.5) return 0.7 + jaccardSim * 0.2;
  const maxLen = Math.max(n1.length, n2.length);
  return 1 - levenshtein(n1, n2) / maxLen;
}

function emailsMatch(email1, email2) {
  const e1 = email1.toLowerCase();
  const e2 = email2.toLowerCase();
  if (e1 === e2) return { match: true, confidence: 1, reason: 'exact-email' };
  
  const local1 = emailLocal(e1);
  const local2 = emailLocal(e2);
  
  if (local1 === local2 && local1.length > 3) {
    return { match: true, confidence: 0.8, reason: 'same-local-part' };
  }
  
  const ghMatch1 = e1.match(/^(\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  const ghMatch2 = e2.match(/^(\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  if (ghMatch1 && ghMatch2 && ghMatch1[2] === ghMatch2[2]) {
    return { match: true, confidence: 0.95, reason: 'github-noreply' };
  }
  if (ghMatch1 && local2 === ghMatch1[2]) {
    return { match: true, confidence: 0.7, reason: 'github-noreply-match' };
  }
  if (ghMatch2 && local1 === ghMatch2[2]) {
    return { match: true, confidence: 0.7, reason: 'github-noreply-match' };
  }
  
  return { match: false, confidence: 0, reason: '' };
}

// ============================================================================
// Scanner
// ============================================================================

function scanAuthors(repoPath) {
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
  
  return authors.sort((a, b) => b.commits - a.commits);
}

// ============================================================================
// Clustering
// ============================================================================

function findClusters(authors, minConfidence = 0.6) {
  const clusters = [];
  const assigned = new Set();
  const sorted = [...authors].sort((a, b) => b.commits - a.commits);

  for (let i = 0; i < sorted.length; i++) {
    if (assigned.has(i)) continue;

    const canonical = sorted[i];
    const aliases = [];
    let clusterReason = '';

    for (let j = i + 1; j < sorted.length; j++) {
      if (assigned.has(j)) continue;

      const candidate = sorted[j];
      let confidence = 0;
      let reason = '';

      const emailResult = emailsMatch(canonical.email, candidate.email);
      if (emailResult.match) {
        confidence = emailResult.confidence;
        reason = emailResult.reason;
      }

      if (!emailResult.match) {
        const nameSim = nameSimilarity(canonical.name, candidate.name);
        if (nameSim > 0.8) {
          if (emailDomain(canonical.email) === emailDomain(candidate.email)) {
            confidence = nameSim * 0.9;
            reason = 'similar-name-same-domain';
          } else {
            confidence = nameSim * 0.7;
            reason = 'similar-name';
          }
        }
      }

      if (emailResult.match) {
        const nameSim = nameSimilarity(canonical.name, candidate.name);
        if (nameSim < 0.3) {
          confidence = emailResult.confidence * 0.6;
          reason = `${emailResult.reason}-name-mismatch`;
        }
      }

      if (confidence >= minConfidence) {
        aliases.push({ ...candidate, confidence, reason });
        assigned.add(j);
        if (!clusterReason) clusterReason = reason;
      }
    }

    if (aliases.length > 0) {
      assigned.add(i);
      clusters.push({
        canonical,
        aliases,
        totalCommits: canonical.commits + aliases.reduce((sum, a) => sum + a.commits, 0),
        reason: clusterReason
      });
    }
  }

  return clusters.sort((a, b) => b.totalCommits - a.totalCommits);
}

// ============================================================================
// Mailmap Generation
// ============================================================================

function generateMailmap(clusters) {
  const lines = ['# Generated by Git Time Machine (gtm authors)'];
  lines.push('# Format: Proper Name <proper@email.com> Alias Name <alias@email.com>');
  lines.push('');
  
  for (const cluster of clusters) {
    const { canonical, aliases } = cluster;
    lines.push(`# Cluster: ${canonical.name} (${cluster.totalCommits} commits)`);
    
    for (const alias of aliases) {
      lines.push(`${canonical.name} <${canonical.email}> ${alias.name} <${alias.email}>`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

// ============================================================================
// Command Handler
// ============================================================================

export async function authorsCommand(path, options) {
  const repoPath = resolve(path);
  
  if (!isGitRepo(repoPath)) {
    printError(`Not a git repository: ${repoPath}`);
    process.exit(1);
  }
  
  const spinner = createSpinner('Scanning git history...');
  
  try {
    // Scan authors
    const authors = scanAuthors(repoPath);
    spinner.update('Finding duplicate identities...');
    
    // Find clusters
    const threshold = parseInt(options.threshold || '70', 10) / 100;
    const clusters = findClusters(authors, threshold);
    
    spinner.stop();
    
    // Calculate stats
    const totalIdentities = authors.length;
    const duplicateIdentities = clusters.reduce((sum, c) => sum + c.aliases.length, 0);
    const uniqueContributors = totalIdentities - duplicateIdentities;
    const consolidationRate = ((duplicateIdentities / totalIdentities) * 100).toFixed(1);
    
    // Output based on format
    if (options.output === 'json') {
      outputJSON({
        stats: {
          totalIdentities,
          duplicateIdentities,
          uniqueContributors,
          consolidationRate: parseFloat(consolidationRate),
          clusters: clusters.length
        },
        clusters: clusters.map(c => ({
          canonical: c.canonical,
          aliases: c.aliases,
          totalCommits: c.totalCommits
        })),
        mailmap: generateMailmap(clusters)
      });
      return;
    }
    
    if (options.output === 'mailmap') {
      console.log(generateMailmap(clusters));
      return;
    }
    
    // Text output
    printHeader('Author Analysis');
    
    printSubheader('Summary');
    printKV('Total identities', totalIdentities);
    printKV('Duplicate clusters', clusters.length);
    printKV('Duplicate identities', duplicateIdentities);
    printKV('Unique contributors', uniqueContributors);
    printKV('Consolidation rate', `${consolidationRate}%`);
    
    if (clusters.length === 0) {
      console.log();
      printSuccess('No duplicate identities found!');
      return;
    }
    
    printSubheader('Duplicate Clusters');
    
    for (const cluster of clusters.slice(0, 10)) {
      const { canonical, aliases, totalCommits, reason } = cluster;
      console.log();
      console.log(`  ${c('bold', canonical.name)} <${canonical.email}> ${c('dim', `(${canonical.commits} commits)`)}`);
      console.log(`  ${c('dim', `└─ ${reason}`)}`);
      
      for (const alias of aliases) {
        const conf = Math.round(alias.confidence * 100);
        console.log(`     ${c('yellow', '→')} ${alias.name} <${alias.email}> ${c('dim', `(${alias.commits} commits, ${conf}% match)`)}`);
      }
    }
    
    if (clusters.length > 10) {
      console.log();
      printInfo(`...and ${clusters.length - 10} more clusters`);
    }
    
    // Apply option
    if (options.apply) {
      const mailmapPath = join(repoPath, '.mailmap');
      const mailmapContent = generateMailmap(clusters);
      
      if (existsSync(mailmapPath)) {
        printWarning('.mailmap already exists. Appending new entries...');
        const existing = readFileSync(mailmapPath, 'utf8');
        writeFileSync(mailmapPath, existing + '\n' + mailmapContent);
      } else {
        writeFileSync(mailmapPath, mailmapContent);
      }
      
      printSuccess(`Generated .mailmap with ${clusters.length} clusters`);
      printInfo('Run `git shortlog -sn` to see normalized authors');
    } else {
      console.log();
      printInfo('Use --output mailmap to generate .mailmap content');
      printInfo('Use --apply to write .mailmap file');
    }
    
  } catch (err) {
    spinner.stop();
    printError(`Failed to analyze authors: ${err.message}`);
    process.exit(1);
  }
}
