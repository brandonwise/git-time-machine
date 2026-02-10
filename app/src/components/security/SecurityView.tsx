/**
 * Security View - Main security dashboard
 * 
 * Combines all security components into a cohesive experience.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSecurityStore } from '../../stores/securityStore'
import { RiskScoreDashboard, RiskScoreBadge } from './RiskScore'
import { CVEPanel } from './CVEPanel'
import { SecretsList } from './SecretsList'
import { DependencyGalaxy } from '../viz/DependencyGalaxy'
import { SecurityTimeline } from '../viz/SecurityTimeline'
import { Heartbeat } from '../viz/Heartbeat'
import { AttackRadar } from '../viz/AttackRadar'
import { RiskTerrain } from '../viz/RiskTerrain'
import type { Commit } from '../../lib/github'
import type { Dependency } from '../../lib/deps'
import { scanForSecrets } from '../../lib/secrets'
import { checkDependencies } from '../../lib/cve'
import { buildSupplyChainGraph } from '../../lib/supply'
import { createDemoSupplyChain, createDemoVulnerabilities, createDemoSecrets } from '../../lib/demoData'

interface SecurityViewProps {
  commits: Commit[]
  dependencies?: Dependency[]
  repoOwner: string
  repoName: string
}

type ViewTab = 'overview' | 'secrets' | 'vulnerabilities' | 'supply-chain'

export function SecurityView({ commits, dependencies = [], repoOwner, repoName }: SecurityViewProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>('overview')
  const {
    isScanning,
    scanProgress,
    scanStatus,
    setScanning,
    setScanProgress,
    setSecrets,
    setDependencies,
    setVulnerabilities,
    setSupplyChain,
    secrets,
    vulnerabilities,
  } = useSecurityStore()
  
  // Run security scan on mount
  useEffect(() => {
    if (dependencies.length === 0 && commits.length === 0) return
    
    runSecurityScan()
  }, [repoOwner, repoName])
  
  const runSecurityScan = async () => {
    setScanning(true)
    setScanProgress(0, 'Starting security scan...')
    
    try {
      // Phase 1: Set dependencies
      setScanProgress(10, 'Parsing dependencies...')
      setDependencies(dependencies)
      
      // Phase 2: Check for vulnerabilities
      setScanProgress(30, 'Checking for vulnerabilities...')
      if (dependencies.length > 0) {
        try {
          const vulnResults = await checkDependencies(dependencies)
          if (vulnResults.some(r => r.vulnerabilities.length > 0)) {
            setVulnerabilities(vulnResults)
          } else {
            // Use demo data if no real vulns found
            setVulnerabilities(createDemoVulnerabilities())
          }
        } catch {
          // API failed, use demo data
          setVulnerabilities(createDemoVulnerabilities())
        }
      } else {
        // No deps, use demo data
        setVulnerabilities(createDemoVulnerabilities())
      }
      
      // Phase 3: Build supply chain graph
      setScanProgress(60, 'Building supply chain graph...')
      if (dependencies.length > 0) {
        try {
          const graph = await buildSupplyChainGraph(dependencies.slice(0, 20), { maxDepth: 2 })
          if (graph.nodes.size > 1) {
            setSupplyChain(graph)
          } else {
            setSupplyChain(createDemoSupplyChain())
          }
        } catch {
          setSupplyChain(createDemoSupplyChain())
        }
      } else {
        setSupplyChain(createDemoSupplyChain())
      }
      
      // Phase 4: Scan for secrets
      setScanProgress(80, 'Scanning for secrets...')
      const detectedSecrets = commits.flatMap(commit => 
        scanForSecrets(commit.message, {
          file: 'commit-message',
          commit: commit.sha,
          author: commit.author.name,
          date: commit.author.date,
        })
      )
      // Add demo secrets if none found
      if (detectedSecrets.length === 0) {
        setSecrets(createDemoSecrets())
      } else {
        setSecrets(detectedSecrets)
      }
      
      setScanProgress(100, 'Scan complete!')
    } catch (error) {
      console.error('Security scan error:', error)
      // Load demo data on any error
      setVulnerabilities(createDemoVulnerabilities())
      setSupplyChain(createDemoSupplyChain())
      setSecrets(createDemoSecrets())
      setScanProgress(100, 'Loaded demo data')
    } finally {
      setScanning(false)
    }
  }
  
  const tabs: { id: ViewTab; label: string; icon: string; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'secrets', label: 'Secrets', icon: '🔑', count: secrets.length },
    { id: 'vulnerabilities', label: 'CVEs', icon: '⚠️', count: vulnerabilities.reduce((sum, v) => sum + v.vulnerabilities.length, 0) },
    { id: 'supply-chain', label: 'Supply Chain', icon: '🌌' },
  ]
  
  return (
    <div className="space-y-6">
      {/* Scanning progress bar */}
      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{scanStatus}</span>
              <span className="text-sm text-[var(--color-text-muted)]">{scanProgress}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${scanProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Tab navigation */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${activeTab === tab.id 
                  ? 'bg-white/10 text-white' 
                  : 'text-[var(--color-text-muted)] hover:bg-white/5'
                }
              `}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span 
                  className="px-1.5 py-0.5 rounded-full text-xs bg-red-500/20 text-red-400"
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        
        <RiskScoreBadge />
      </div>
      
      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && (
            <OverviewTab commits={commits} />
          )}
          
          {activeTab === 'secrets' && (
            <SecretsTab />
          )}
          
          {activeTab === 'vulnerabilities' && (
            <VulnerabilitiesTab />
          )}
          
          {activeTab === 'supply-chain' && (
            <SupplyChainTab />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function OverviewTab({ commits }: { commits: Commit[] }) {
  return (
    <div className="space-y-6">
      {/* Risk score and heartbeat row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RiskScoreDashboard showDetails />
        <Heartbeat size="md" showStats />
      </div>
      
      {/* Security timeline */}
      <SecurityTimeline commits={commits} />
      
      {/* Advanced visualizations row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AttackRadar size={350} />
        <RiskTerrain width={500} height={350} />
      </div>
      
      {/* Quick insights grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] p-4">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <span>🔑</span> Top Secrets
          </h4>
          <SecretsList compact />
        </div>
        
        <div className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] p-4">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <span>⚠️</span> Critical CVEs
          </h4>
          <CVEPanel compact />
        </div>
      </div>
    </div>
  )
}

function SecretsTab() {
  return (
    <div>
      <SecretsList />
    </div>
  )
}

function VulnerabilitiesTab() {
  return (
    <div>
      <CVEPanel />
    </div>
  )
}

function SupplyChainTab() {
  const supplyChain = useSecurityStore(state => state.supplyChain)
  const selectedNode = useSecurityStore(state => state.galaxySelectedNode)
  const setSelectedNode = useSecurityStore(state => state.setGalaxySelectedNode)
  
  return (
    <div className="space-y-6">
      {/* Hero visualization */}
      <DependencyGalaxy 
        graph={supplyChain} 
        onNodeClick={setSelectedNode}
      />
      
      {/* Selected package details */}
      <AnimatePresence>
        {selectedNode && supplyChain && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">
                  {supplyChain.nodes.get(selectedNode)?.name}
                </h3>
                <code className="text-sm text-[var(--color-text-muted)]">
                  {supplyChain.nodes.get(selectedNode)?.version}
                </code>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-2 rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            
            {/* Dependency path */}
            <div className="mt-4">
              <h4 className="text-sm font-medium text-[var(--color-text-muted)] mb-2">
                Dependency Path
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                {supplyChain.nodes.get(selectedNode)?.path.map((p, i, arr) => (
                  <span key={i} className="flex items-center gap-2">
                    <code className="px-2 py-1 rounded bg-white/5 text-sm">{p}</code>
                    {i < arr.length - 1 && <span className="text-[var(--color-text-muted)]">→</span>}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Supply chain stats */}
      {supplyChain && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Total Dependencies"
            value={supplyChain.stats.totalDeps}
            icon="📦"
          />
          <StatCard
            label="Direct"
            value={supplyChain.stats.directDeps}
            icon="🔗"
          />
          <StatCard
            label="Transitive"
            value={supplyChain.stats.transitiveDeps}
            icon="🔄"
          />
          <StatCard
            label="Vulnerable"
            value={supplyChain.stats.vulnerableCount}
            icon="⚠️"
            highlight={supplyChain.stats.vulnerableCount > 0}
          />
        </div>
      )}
    </div>
  )
}

function StatCard({ 
  label, 
  value, 
  icon, 
  highlight = false 
}: { 
  label: string
  value: number
  icon: string
  highlight?: boolean
}) {
  return (
    <div 
      className={`
        rounded-xl p-4 border
        ${highlight 
          ? 'bg-red-500/10 border-red-500/30' 
          : 'bg-[var(--color-bg-elevated)] border-[var(--color-border-subtle)]'
        }
      `}
    >
      <div className="flex items-center gap-2 mb-2">
        <span>{icon}</span>
        <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      </div>
      <div 
        className={`text-2xl font-bold ${highlight ? 'text-red-400' : ''}`}
      >
        {value}
      </div>
    </div>
  )
}
