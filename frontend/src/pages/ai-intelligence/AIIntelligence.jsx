import { useState } from 'react'
import { Brain, AlertTriangle, RefreshCw, CheckCircle, XCircle, Zap, ChevronRight, Activity } from 'lucide-react'

const ANOMALIES = [
  {
    id: 1, severity: 'critical', type: 'License Compliance', title: 'Adobe Creative Cloud Near Capacity',
    description: '48 of 50 licenses in use (96%). Risk of service interruption if 2 more users need access.',
    asset: 'Adobe Creative Cloud', action: 'Purchase 10 additional licenses or review inactive users',
    category: 'License', status: 'active', detected: '2 hours ago'
  },
  {
    id: 2, severity: 'critical', type: 'Security', title: 'Firewall Firmware Outdated',
    description: 'Cisco ASA 5506-X is running firmware 2 major versions behind latest. Known CVEs present.',
    asset: 'Cisco ASA 5506-X (HW-010)', action: 'Schedule immediate firmware update during maintenance window',
    category: 'Security', status: 'active', detected: '1 day ago'
  },
  {
    id: 3, severity: 'high', type: 'AI Budget Alert', title: 'OpenAI API Spend at 84% of Budget',
    description: 'Monthly OpenAI GPT-4 API spend has reached $840 of $1,000 budget with 8 days remaining.',
    asset: 'OpenAI GPT-4 License', action: 'Review API call patterns, consider switching non-critical workloads to GPT-3.5',
    category: 'AI License', status: 'active', detected: '3 hours ago'
  },
  {
    id: 4, severity: 'high', type: 'Inactive Users', title: '5 Users with Unused Licenses (60+ days)',
    description: 'Sarah K., Tom R., Mike L., Anna P., James W. have not logged in for over 60 days but retain active software licenses worth $380/month.',
    asset: 'Slack, Zoom, GitHub Enterprise', action: 'Initiate license reclamation workflow for these users',
    category: 'Cost', status: 'active', detected: '1 week ago'
  },
  {
    id: 5, severity: 'high', type: 'Shadow IT', title: '3 Unsanctioned SaaS Apps Detected',
    description: 'Network monitoring detected Notion, Figma, and Monday.com being accessed by 14 corporate users without IT approval or procurement.',
    asset: 'Corporate Network', action: 'Review apps for sanctioning or block via web proxy',
    category: 'Shadow IT', status: 'active', detected: '2 days ago'
  },
  {
    id: 6, severity: 'medium', type: 'Warranty Expiry', title: '4 Hardware Assets Warranty Expiring (30 days)',
    description: 'Dell XPS Laptop (HW-001), HP LaserJet (HW-008), Lenovo ThinkPad (HW-009), Cisco Switch (HW-004) warranties expire within 30 days.',
    asset: '4 Hardware Assets', action: 'Initiate renewal or replacement procurement',
    category: 'Warranty', status: 'active', detected: 'Today'
  },
  {
    id: 7, severity: 'medium', type: 'Cloud Cost Spike', title: 'AWS Costs Up 23% This Month',
    description: 'EC2 and S3 costs increased by $1,847 compared to last month. Primary driver: untagged dev instances left running over weekend.',
    asset: 'AWS Cloud Resources', action: 'Implement auto-shutdown policies for dev/staging environments',
    category: 'Cost', status: 'active', detected: '12 hours ago'
  },
  {
    id: 8, severity: 'medium', type: 'License Optimization', title: 'Microsoft 365 Utilization at 84.6%',
    description: '423 of 500 Microsoft 365 licenses in use. 77 unused licenses cost ~$1,155/month.',
    asset: 'Microsoft Office 365', action: 'Audit inactive accounts and reclaim unused licenses',
    category: 'License', status: 'active', detected: '3 days ago'
  },
  {
    id: 9, severity: 'low', type: 'AI License', title: 'Claude API Usage Pattern Change',
    description: 'Anthropic Claude API call volume increased 340% in the last 7 days. Verify this is authorized usage.',
    asset: 'Anthropic Claude License', action: 'Review API key assignments and usage logs',
    category: 'AI License', status: 'active', detected: '2 days ago'
  },
  {
    id: 10, severity: 'low', type: 'Compliance', title: 'OS Patch Missing on 3 Devices',
    description: 'Windows 11 critical patch KB5034123 not applied on 3 engineering laptops.',
    asset: 'Engineering Laptops', action: 'Push patch via MDM or schedule manual update',
    category: 'Compliance', status: 'resolved', detected: '5 days ago'
  },
]

const SEV_CONFIG = {
  critical: { color: 'text-red-400', bg: 'bg-red-900/20', border: 'border-red-800/50', dot: 'bg-red-500' },
  high: { color: 'text-orange-400', bg: 'bg-orange-900/20', border: 'border-orange-800/50', dot: 'bg-orange-500' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-900/20', border: 'border-yellow-800/50', dot: 'bg-yellow-500' },
  low: { color: 'text-blue-400', bg: 'bg-blue-900/20', border: 'border-blue-800/50', dot: 'bg-blue-500' },
}

const CAT_COLORS = {
  'License': 'bg-purple-900/30 text-purple-300',
  'AI License': 'bg-blue-900/30 text-blue-300',
  'Security': 'bg-red-900/30 text-red-300',
  'Cost': 'bg-yellow-900/30 text-yellow-300',
  'Shadow IT': 'bg-orange-900/30 text-orange-300',
  'Warranty': 'bg-teal-900/30 text-teal-300',
  'Compliance': 'bg-green-900/30 text-green-300',
}

export default function AIIntelligence() {
  const [anomalies, setAnomalies] = useState(ANOMALIES)
  const [filter, setFilter] = useState('all')
  const [scanning, setScanning] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const active = anomalies.filter(a => a.status === 'active')
  const critical = anomalies.filter(a => a.severity === 'critical' && a.status === 'active')
  const resolved = anomalies.filter(a => a.status === 'resolved')

  const displayed = anomalies.filter(a => {
    if (filter === 'active') return a.status === 'active'
    if (filter === 'critical') return a.severity === 'critical'
    if (filter === 'resolved') return a.status === 'resolved'
    return true
  })

  const handleScan = () => {
    setScanning(true)
    setTimeout(() => setScanning(false), 2500)
  }

  const resolve = (id) => setAnomalies(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved' } : a))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600/20 border border-blue-700/50 rounded-xl flex items-center justify-center">
            <Brain size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">AI Intelligence</h1>
            <p className="text-xs text-gray-500">Anomaly detection &amp; predictive insights</p>
          </div>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning…' : 'Run AI Scan'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Alerts', value: active.length, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-900/20 border-red-800/40' },
          { label: 'Critical Issues', value: critical.length, icon: XCircle, color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-800/40' },
          { label: 'AI Anomalies', value: anomalies.length, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-800/40' },
          { label: 'Auto-Resolved', value: resolved.length, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/20 border-green-800/40' },
        ].map(s => (
          <div key={s.label} className={`card p-4 border ${s.bg} flex items-center gap-3`}>
            <s.icon size={22} className={s.color} />
            <div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[['all', 'All'], ['active', 'Active'], ['critical', 'Critical'], ['resolved', 'Resolved']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === v
                ? 'bg-blue-600 text-white'
                : 'bg-[#1a1a1f] border border-[#2a2a35] text-gray-400 hover:text-gray-200'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Anomaly list */}
      <div className="space-y-3">
        {displayed.map(a => {
          const sev = SEV_CONFIG[a.severity]
          const isExp = expanded === a.id
          return (
            <div key={a.id} className={`card border ${sev.border} ${a.status === 'resolved' ? 'opacity-60' : ''}`}>
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpanded(isExp ? null : a.id)}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.dot} ${a.status === 'active' ? 'animate-pulse' : ''}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-semibold uppercase tracking-wider ${sev.color}`}>{a.severity}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${CAT_COLORS[a.category] || 'bg-gray-800 text-gray-400'}`}>
                      {a.category}
                    </span>
                    <span className="text-xs text-gray-600">{a.detected}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-200 truncate">{a.title}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {a.status === 'resolved' ? (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle size={12} /> Resolved
                    </span>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); resolve(a.id) }}
                      className="text-xs px-2 py-1 bg-green-900/30 border border-green-800/40 text-green-400 hover:bg-green-900/50 rounded-lg transition-colors"
                    >
                      Resolve
                    </button>
                  )}
                  <ChevronRight
                    size={14}
                    className={`text-gray-600 transition-transform ${isExp ? 'rotate-90' : ''}`}
                  />
                </div>
              </div>
              {isExp && (
                <div className="px-4 pb-4 pt-0 border-t border-[#2a2a35] space-y-3">
                  <p className="text-sm text-gray-400 pt-3">{a.description}</p>
                  <div className="flex items-start gap-2">
                    <span className="text-xs text-gray-600 w-20 flex-shrink-0 pt-0.5">Affected:</span>
                    <span className="text-xs font-medium text-gray-300">{a.asset}</span>
                  </div>
                  <div className={`flex items-start gap-2 p-3 rounded-lg ${sev.bg} border ${sev.border}`}>
                    <Zap size={13} className={`${sev.color} flex-shrink-0 mt-0.5`} />
                    <div>
                      <p className="text-xs font-medium text-gray-300 mb-0.5">Recommended Action</p>
                      <p className="text-xs text-gray-400">{a.action}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
