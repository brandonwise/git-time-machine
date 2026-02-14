# Git Time Machine

**Understand any Git repository in minutes.**

One unified tool for repository analysis:
- 📊 **Visualize** commits, contributors, activity timeline
- 👥 **Authors** — detect duplicates, generate .mailmap
- 🚩 **Flags** — find stale feature flags  
- 🐷 **Bloat** — locate large files in history
- 🔐 **Security** — secret detection, CVE scanning

## Installation

```bash
npm install -g git-time-machine
```

## Quick Start

```bash
# Full analysis
gtm analyze

# Just find duplicate authors
gtm authors

# Find stale feature flags
gtm flags

# Check for repository bloat
gtm bloat

# Launch web visualization
gtm visualize
```

## Commands

### `gtm analyze`

Run full repository analysis with all modules.

```bash
gtm analyze                    # All modules
gtm analyze --include authors,flags  # Specific modules
gtm analyze --output json      # JSON output
```

### `gtm authors`

Detect duplicate Git identities and generate .mailmap files.

```bash
gtm authors                    # Text summary
gtm authors --output mailmap   # Generate .mailmap
gtm authors --apply            # Write .mailmap file
gtm authors --threshold 80     # Higher match threshold
```

### `gtm flags`

Find stale feature flags (hardcoded to true/false).

```bash
gtm flags                      # Text summary
gtm flags --stale-only         # Only show stale flags
gtm flags --diff               # Generate cleanup patches
gtm flags --output json        # JSON for CI
```

Detects patterns from:
- LaunchDarkly, Split.io, Unleash, Flipper
- Environment variables (`FEATURE_*`)
- Generic patterns (`isFeatureEnabled()`, etc.)

### `gtm bloat`

Find large files bloating your repository.

```bash
gtm bloat                      # Top 20 largest
gtm bloat --limit 50           # More files
gtm bloat --include-deleted    # Include deleted files in history
gtm bloat --min-size 5242880   # 5MB minimum
```

### `gtm visualize`

Launch the web UI for interactive visualization.

```bash
gtm visualize                  # Open in browser
gtm visualize --port 8080      # Custom port
gtm visualize --no-open        # Don't open browser
```

### `gtm ci`

CI/CD mode with JSON output and exit codes.

```bash
gtm ci                              # Run all checks
gtm ci --fail-on-secrets            # Exit 1 if secrets found
gtm ci --fail-on-stale-flags        # Exit 1 if stale flags
gtm ci --fail-on-bloat 10           # Exit 1 if files > 10MB
gtm ci --fail-on-duplicates         # Exit 1 if duplicate authors
```

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Author Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Summary
Total identities: 653
Duplicate clusters: 71
Unique contributors: 551
Consolidation rate: 15.6%

▸ Duplicate Clusters

  Peter Steinberger <steipete@gmail.com> (7211 commits)
  └─ similar-name
     → Peter Steinberger <peter@steipete.me> (3 commits, 70% match)
```

## Programmatic API

```javascript
import { analyzeAuthors } from 'git-time-machine/authors';
import { scanFlags } from 'git-time-machine/flags';
import { analyzeBlobs } from 'git-time-machine/bloat';

// Use in your own tools
const duplicates = await analyzeAuthors('/path/to/repo');
const staleFlags = await scanFlags('/path/to/repo');
const largeFiles = await analyzeBlobs('/path/to/repo');
```

## Included Tools

Git Time Machine integrates:
- **authorsync** — duplicate author detection
- **flagsweep** — feature flag scanner
- **gitfat** — repository bloat analyzer

All in one unified CLI.

## License

MIT
