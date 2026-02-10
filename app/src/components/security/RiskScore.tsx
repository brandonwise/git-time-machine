/**
 * Risk Score Dashboard
 * 
 * A stunning animated gauge showing overall security health.
 */

import { motion, useSpring, useTransform } from 'framer-motion'
import { useSecurityStore } from '../../stores/securityStore'

interface RiskScoreProps {
  score?: number // 0-100
  size?: 'sm' | 'md' | 'lg'
  showDetails?: boolean
}

function getRiskLevel(score: number): { 
  label: string
  color: string
  bgColor: string
  glow: string
} {
  if (score >= 75) return {
    label: 'Critical',
    color: '#ff4444',
    bgColor: 'rgba(255, 68, 68, 0.15)',
    glow: '0 0 40px rgba(255, 68, 68, 0.6)',
  }
  if (score >= 50) return {
    label: 'High',
    color: '#ff8c00',
    bgColor: 'rgba(255, 140, 0, 0.15)',
    glow: '0 0 30px rgba(255, 140, 0, 0.5)',
  }
  if (score >= 25) return {
    label: 'Medium',
    color: '#ffcc00',
    bgColor: 'rgba(255, 204, 0, 0.15)',
    glow: '0 0 25px rgba(255, 204, 0, 0.4)',
  }
  if (score > 0) return {
    label: 'Low',
    color: '#88cc44',
    bgColor: 'rgba(136, 204, 68, 0.15)',
    glow: '0 0 20px rgba(136, 204, 68, 0.3)',
  }
  return {
    label: 'Secure',
    color: '#44cc44',
    bgColor: 'rgba(68, 204, 68, 0.15)',
    glow: '0 0 30px rgba(68, 204, 68, 0.4)',
  }
}

const sizeConfig = {
  sm: { size: 120, stroke: 8, fontSize: 'text-2xl' },
  md: { size: 180, stroke: 12, fontSize: 'text-4xl' },
  lg: { size: 240, stroke: 16, fontSize: 'text-5xl' },
}

export function RiskScoreGauge({ score = 0, size = 'md' }: RiskScoreProps) {
  const config = sizeConfig[size]
  const risk = getRiskLevel(score)
  
  // Animate the score
  const springValue = useSpring(0, { damping: 30, stiffness: 100 })
  springValue.set(score)
  
  const displayScore = useTransform(springValue, (v) => Math.round(v))
  
  // Calculate SVG arc
  const radius = (config.size - config.stroke) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = useTransform(
    springValue,
    (v) => circumference - (v / 100) * circumference
  )
  
  return (
    <div 
      className="relative inline-flex items-center justify-center"
      style={{ width: config.size, height: config.size }}
    >
      {/* Background glow */}
      <div 
        className="absolute inset-0 rounded-full blur-xl"
        style={{ backgroundColor: risk.bgColor }}
      />
      
      {/* SVG gauge */}
      <svg 
        className="absolute inset-0 -rotate-90"
        width={config.size}
        height={config.size}
      >
        {/* Background track */}
        <circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={config.stroke}
        />
        
        {/* Progress arc */}
        <motion.circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          fill="none"
          stroke={risk.color}
          strokeWidth={config.stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset }}
          initial={{ strokeDashoffset: circumference }}
        />
        
        {/* Glow effect */}
        <motion.circle
          cx={config.size / 2}
          cy={config.size / 2}
          r={radius}
          fill="none"
          stroke={risk.color}
          strokeWidth={config.stroke + 4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ 
            strokeDashoffset,
            filter: `blur(8px)`,
            opacity: 0.5,
          }}
        />
      </svg>
      
      {/* Center content */}
      <div className="relative z-10 text-center">
        <motion.div 
          className={`${config.fontSize} font-bold`}
          style={{ color: risk.color }}
        >
          {displayScore}
        </motion.div>
        <div 
          className="text-sm font-medium mt-1"
          style={{ color: risk.color }}
        >
          {risk.label}
        </div>
      </div>
    </div>
  )
}

export function RiskScoreDashboard({ showDetails = true }: RiskScoreProps) {
  const { 
    overallRiskScore, 
    secretsCount, 
    criticalVulnCount, 
    highVulnCount,
    dependencies,
    vulnerabilities,
  } = useSecurityStore()
  
  const risk = getRiskLevel(overallRiskScore)
  const totalVulns = vulnerabilities.reduce(
    (sum, v) => sum + v.vulnerabilities.length, 
    0
  )
  
  return (
    <div 
      className="rounded-2xl p-6 border"
      style={{ 
        backgroundColor: risk.bgColor,
        borderColor: risk.color + '40',
        boxShadow: risk.glow,
      }}
    >
      <div className="flex items-center gap-8">
        {/* Main gauge */}
        <RiskScoreGauge score={overallRiskScore} size="lg" />
        
        {/* Stats */}
        {showDetails && (
          <div className="flex-1 grid grid-cols-2 gap-4">
            <StatCard
              icon="🔑"
              label="Secrets Detected"
              value={secretsCount}
              color={secretsCount > 0 ? '#ff4444' : '#44cc44'}
            />
            <StatCard
              icon="⚠️"
              label="Vulnerabilities"
              value={totalVulns}
              color={totalVulns > 0 ? '#ff8c00' : '#44cc44'}
            />
            <StatCard
              icon="🔴"
              label="Critical CVEs"
              value={criticalVulnCount}
              color={criticalVulnCount > 0 ? '#ff4444' : '#44cc44'}
            />
            <StatCard
              icon="📦"
              label="Dependencies"
              value={dependencies.length}
              color="#4488ff"
            />
          </div>
        )}
      </div>
      
      {/* Risk breakdown */}
      {showDetails && (
        <div className="mt-6 pt-6 border-t border-white/10">
          <h4 className="text-sm font-medium text-gray-400 mb-3">Risk Breakdown</h4>
          <div className="space-y-2">
            <RiskBar 
              label="Secrets" 
              value={Math.min(secretsCount * 10, 100)} 
              color="#ff4444"
            />
            <RiskBar 
              label="Critical CVEs" 
              value={Math.min(criticalVulnCount * 25, 100)} 
              color="#ff8c00"
            />
            <RiskBar 
              label="High CVEs" 
              value={Math.min(highVulnCount * 15, 100)} 
              color="#ffcc00"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: string
  label: string
  value: number
  color: string
}) {
  return (
    <motion.div 
      className="p-4 rounded-xl bg-black/30 border border-white/10 overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-center gap-2 mb-1 min-w-0">
        <span className="flex-shrink-0">{icon}</span>
        <span className="text-xs text-gray-400 truncate">{label}</span>
      </div>
      <div 
        className="text-2xl font-bold truncate"
        style={{ color }}
      >
        {value}
      </div>
    </motion.div>
  )
}

function RiskBar({ 
  label, 
  value, 
  color 
}: { 
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-xs text-gray-400 w-24 flex-shrink-0 truncate">{label}</span>
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden min-w-0">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <span 
        className="text-xs font-medium w-10 text-right flex-shrink-0"
        style={{ color }}
      >
        {value}%
      </span>
    </div>
  )
}

// Compact version for header/sidebar
export function RiskScoreBadge() {
  const score = useSecurityStore(state => state.overallRiskScore)
  const risk = getRiskLevel(score)
  
  return (
    <motion.div 
      className="flex items-center gap-2 px-3 py-1.5 rounded-full"
      style={{ 
        backgroundColor: risk.bgColor,
        boxShadow: score > 0 ? risk.glow : undefined,
      }}
      whileHover={{ scale: 1.05 }}
    >
      <div 
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: risk.color }}
      />
      <span 
        className="text-sm font-medium"
        style={{ color: risk.color }}
      >
        {risk.label}
      </span>
    </motion.div>
  )
}
