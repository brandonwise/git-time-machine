/**
 * Demo data for when APIs are unavailable (CORS issues, rate limits, etc.)
 */

import type { SupplyChainGraph, DependencyNode } from './supply'
import type { VulnerabilityResult } from './cve'
import type { DetectedSecret } from './secrets'
import type { Dependency } from './deps'

export function createDemoSupplyChain(): SupplyChainGraph {
  const nodes = new Map<string, DependencyNode>()
  
  // Root project
  nodes.set('npm:project@1.0.0', {
    name: 'project',
    version: '1.0.0',
    ecosystem: 'npm',
    depth: 0,
    path: ['project'],
    riskScore: 0,
  })
  
  // Direct dependencies
  const directDeps = [
    { name: 'react', version: '18.2.0', risk: 0 },
    { name: 'lodash', version: '4.17.21', risk: 15 },
    { name: 'axios', version: '1.4.0', risk: 0 },
    { name: 'express', version: '4.18.2', risk: 25, vulns: 2 },
    { name: 'moment', version: '2.29.4', risk: 10, vulns: 1 },
  ]
  
  directDeps.forEach((dep, i) => {
    const id = `npm:${dep.name}@${dep.version}`
    nodes.set(id, {
      name: dep.name,
      version: dep.version,
      ecosystem: 'npm',
      depth: 1,
      path: ['project', dep.name],
      riskScore: dep.risk,
      isVulnerable: (dep.vulns || 0) > 0,
      vulnerabilityCount: dep.vulns || 0,
    })
  })
  
  // Transitive dependencies
  const transitiveDeps = [
    { name: 'body-parser', version: '1.20.1', parent: 'express', risk: 0 },
    { name: 'cookie', version: '0.5.0', parent: 'express', risk: 35, vulns: 1 },
    { name: 'qs', version: '6.11.0', parent: 'express', risk: 0 },
    { name: 'react-dom', version: '18.2.0', parent: 'react', risk: 0 },
    { name: 'scheduler', version: '0.23.0', parent: 'react', risk: 0 },
    { name: 'follow-redirects', version: '1.15.2', parent: 'axios', risk: 45, vulns: 2 },
    { name: 'form-data', version: '4.0.0', parent: 'axios', risk: 0 },
    { name: 'mime-types', version: '2.1.35', parent: 'body-parser', risk: 0 },
    { name: 'debug', version: '4.3.4', parent: 'body-parser', risk: 0 },
    { name: 'ms', version: '2.1.3', parent: 'debug', risk: 0 },
  ]
  
  transitiveDeps.forEach(dep => {
    const id = `npm:${dep.name}@${dep.version}`
    nodes.set(id, {
      name: dep.name,
      version: dep.version,
      ecosystem: 'npm',
      depth: 2,
      path: ['project', dep.parent, dep.name],
      riskScore: dep.risk,
      isVulnerable: (dep.vulns || 0) > 0,
      vulnerabilityCount: dep.vulns || 0,
    })
  })
  
  // Build edges
  const edges: Array<{ from: string; to: string }> = []
  
  // Project to direct deps
  directDeps.forEach(dep => {
    edges.push({ from: 'npm:project@1.0.0', to: `npm:${dep.name}@${dep.version}` })
  })
  
  // Direct to transitive
  transitiveDeps.forEach(dep => {
    const parentDep = directDeps.find(d => d.name === dep.parent)
    if (parentDep) {
      edges.push({
        from: `npm:${parentDep.name}@${parentDep.version}`,
        to: `npm:${dep.name}@${dep.version}`
      })
    }
  })
  
  return {
    root: 'project',
    nodes,
    edges,
    stats: {
      totalDeps: nodes.size,
      directDeps: directDeps.length,
      transitiveDeps: transitiveDeps.length,
      maxDepth: 2,
      vulnerableCount: 4,
      avgRiskScore: 25,
    },
  }
}

export function createDemoVulnerabilities(): VulnerabilityResult[] {
  return [
    {
      dependency: { name: 'express', version: '4.18.2', ecosystem: 'npm', isDev: false, source: 'package.json' },
      vulnerabilities: [
        {
          id: 'GHSA-rv95-896h-c2vc',
          aliases: ['CVE-2024-29041'],
          summary: 'Express.js Open Redirect vulnerability',
          details: 'Versions of Express.js prior to 4.19.2 are vulnerable to open redirects.',
          severity: 'MEDIUM',
          cvss: 6.1,
          published: '2024-03-25',
          modified: '2024-03-26',
          references: [{ type: 'ADVISORY', url: 'https://github.com/advisories/GHSA-rv95-896h-c2vc' }],
          affected: [{ package: 'express', ecosystem: 'npm', versions: ['4.18.2'], ranges: [{ introduced: '0', fixed: '4.19.2' }] }],
        },
      ],
      riskScore: 25,
    },
    {
      dependency: { name: 'follow-redirects', version: '1.15.2', ecosystem: 'npm', isDev: false, source: 'transitive' },
      vulnerabilities: [
        {
          id: 'GHSA-jchw-25xp-jwwc',
          aliases: ['CVE-2024-28849'],
          summary: 'follow-redirects improperly handles URLs in the url.parse() function',
          details: 'follow-redirects clears Authorization header during cross-domain redirect, but keeps the host credentials.',
          severity: 'HIGH',
          cvss: 7.4,
          published: '2024-03-14',
          modified: '2024-03-15',
          references: [{ type: 'ADVISORY', url: 'https://github.com/advisories/GHSA-jchw-25xp-jwwc' }],
          affected: [{ package: 'follow-redirects', ecosystem: 'npm', versions: ['1.15.2'], ranges: [{ introduced: '0', fixed: '1.15.6' }] }],
        },
        {
          id: 'GHSA-pw2r-vq6v-hr8c',
          aliases: ['CVE-2024-28176'],
          summary: 'Improper Input Validation in follow-redirects',
          details: 'When fetching a remote URL with the Cookie header, if the server responds with multiple Set-Cookie headers, it may cause resource exhaustion.',
          severity: 'MEDIUM',
          cvss: 5.3,
          published: '2024-01-22',
          modified: '2024-01-23',
          references: [{ type: 'ADVISORY', url: 'https://github.com/advisories/GHSA-pw2r-vq6v-hr8c' }],
          affected: [{ package: 'follow-redirects', ecosystem: 'npm', versions: ['1.15.2'], ranges: [{ introduced: '0', fixed: '1.15.5' }] }],
        },
      ],
      riskScore: 45,
    },
    {
      dependency: { name: 'cookie', version: '0.5.0', ecosystem: 'npm', isDev: false, source: 'transitive' },
      vulnerabilities: [
        {
          id: 'GHSA-pxg6-pf52-xh8x',
          aliases: ['CVE-2024-47764'],
          summary: 'cookie accepts cookie name, path, and domain with out of bounds characters',
          details: 'The cookie library allows cookies with out of bounds characters in the name, path, and domain.',
          severity: 'LOW',
          cvss: 3.1,
          published: '2024-10-04',
          modified: '2024-10-04',
          references: [{ type: 'ADVISORY', url: 'https://github.com/advisories/GHSA-pxg6-pf52-xh8x' }],
          affected: [{ package: 'cookie', ecosystem: 'npm', versions: ['0.5.0'], ranges: [{ introduced: '0', fixed: '0.7.0' }] }],
        },
      ],
      riskScore: 15,
    },
  ]
}

export function createDemoSecrets(): DetectedSecret[] {
  return [
    {
      id: 'demo-secret-1',
      pattern: {
        id: 'aws-access-key',
        name: 'AWS Access Key ID',
        pattern: /AKIA[A-Z0-9]{16}/g,
        severity: 'critical',
        description: 'AWS Access Key ID found in configuration file',
      },
      match: 'AKIAIOSFODNN7EXAMPLE',
      redactedMatch: 'AKIA████████████████',
      file: 'config/aws.js',
      line: 12,
      column: 15,
      commit: 'abc1234',
      author: 'dev@example.com',
      date: '2024-01-15T10:30:00Z',
    },
    {
      id: 'demo-secret-2',
      pattern: {
        id: 'github-pat',
        name: 'GitHub Personal Access Token',
        pattern: /ghp_[A-Za-z0-9]{36}/g,
        severity: 'critical',
        description: 'GitHub Personal Access Token exposed in example file',
      },
      match: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      redactedMatch: 'ghp_████████████████████████████████████',
      file: '.env.example',
      line: 5,
      column: 12,
      commit: 'def5678',
      author: 'admin@example.com',
      date: '2024-02-20T14:45:00Z',
    },
    {
      id: 'demo-secret-3',
      pattern: {
        id: 'private-key',
        name: 'Private Key',
        pattern: /-----BEGIN RSA PRIVATE KEY-----/g,
        severity: 'critical',
        description: 'RSA Private Key committed to repository',
      },
      match: '-----BEGIN RSA PRIVATE KEY-----',
      redactedMatch: '-----BEGIN RSA PRIVATE KEY-----',
      file: 'certs/server.key',
      line: 1,
      column: 0,
      commit: 'ghi9012',
      author: 'ops@example.com',
      date: '2023-11-10T09:15:00Z',
    },
  ]
}
