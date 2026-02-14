# Git Time Machine — Unified Platform

## Vision

One tool to understand any Git repository:

```bash
# Single CLI with subcommands
gtm analyze                    # Full repo analysis
gtm visualize                  # Launch web UI
gtm authors                    # Duplicate detection + mailmap
gtm flags                      # Stale feature flag scan
gtm bloat                      # Large files in history
gtm secrets                    # Secret detection (Gitleaks)
gtm deps                       # Dependency security (OSV/NVD)
```

## Architecture

```
git-time-machine/
├── cli/                       # Unified CLI (gtm)
│   ├── index.js              # Main entry, subcommand router
│   ├── commands/
│   │   ├── analyze.js        # Full analysis orchestrator
│   │   ├── visualize.js      # Launch web UI
│   │   ├── authors.js        # ← authorsync
│   │   ├── flags.js          # ← flagsweep
│   │   ├── bloat.js          # ← gitfat
│   │   ├── secrets.js        # Secret scanning
│   │   └── deps.js           # Dependency analysis
│   └── lib/
│       ├── git.js            # Git operations (shared)
│       ├── output.js         # Formatters (shared)
│       └── cache.js          # Result caching
├── app/                       # Web UI (existing)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Overview.tsx      # Existing
│   │   │   ├── Authors.tsx       # NEW: author health
│   │   │   ├── Flags.tsx         # NEW: feature flag debt
│   │   │   ├── Bloat.tsx         # NEW: size analysis
│   │   │   ├── Security.tsx      # Existing (secrets + deps)
│   │   │   └── Timeline.tsx      # Existing
│   │   └── components/
│   └── ...
└── package.json               # Monorepo or single package
```

## Data Model

```typescript
interface RepoAnalysis {
  // Core
  repo: { name, owner, url, default_branch }
  stats: { commits, contributors, files, lines }
  
  // Timeline (existing)
  activity: CommitActivity[]
  
  // Authors (authorsync)
  authors: {
    canonical: Author[]           // Normalized
    duplicates: DuplicateCluster[]
    mailmap: string               // Generated .mailmap
  }
  
  // Flags (flagsweep)
  flags: {
    total: number
    stale: FeatureFlag[]          // Hardcoded true/false
    active: FeatureFlag[]
    cleanupDiff: string           // Suggested removals
  }
  
  // Bloat (gitfat)
  bloat: {
    totalSize: number
    largestFiles: BlobInfo[]
    deletedButPresent: BlobInfo[]
    recommendations: string[]
  }
  
  // Security (existing)
  secrets: SecretFinding[]
  vulnerabilities: CVE[]
}
```

## Integration Steps

### Phase 1: Unified CLI (Today)
1. Create `cli/` folder with subcommand structure
2. Copy authorsync, flagsweep, gitfat into `commands/`
3. Extract shared utilities to `lib/`
4. Single `gtm` binary

### Phase 2: Web UI Integration
1. Add Authors, Flags, Bloat pages to React app
2. CLI can output JSON for web consumption
3. API routes to run analysis on-demand

### Phase 3: Polish
1. Caching (don't re-analyze unchanged repos)
2. Progress indicators
3. CI integration (`gtm ci` for GitHub Actions)

## Quick Start (After Integration)

```bash
# Install globally
npm install -g git-time-machine

# Full analysis
gtm analyze

# Just authors
gtm authors --output mailmap > .mailmap

# Web UI
gtm visualize
# Opens http://localhost:5173

# CI mode (JSON output, non-zero exit on issues)
gtm ci --fail-on-secrets --fail-on-stale-flags
```
