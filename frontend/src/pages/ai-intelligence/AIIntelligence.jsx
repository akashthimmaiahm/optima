import { useState, useEffect } from 'react'
import { Brain, AlertTriangle, RefreshCw, CheckCircle, XCircle, Zap, ChevronRight, Activity } from 'lucide-react'
import api from '../../api/axios'

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
  const [anomalies, setAnomalies] = useState([])
  const [stats, setStats] = useState({ active: 0, critical: 0, total: 0, resolved: 0 })
  const [filter, setFilter] = useState('all')
  const [scanning, setScanning] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true)
    setError(null)
    api.get('/ai-intelligence/anomalies')
      .then(r => {
        setAnomalies(r.data.anomalies || [])
        setStats(r.data.stats || { active: 0, critical: 0, total: 0, resolved: 0 })
        if (r.data.error) setError(r.data.error)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleScan = () => {
    setScanning(true)
    load()
    setTimeout(() => setScanning(false), 1500)
  }

  const resolve = (id) => setAnomalies(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved' } : a))

  const displayed = anomalies.filter(a => {
    if (filter === 'active') return a.status === 'active'
    if (filter === 'critical') return a.severity === 'critical'
    if (filter === 'resolved') return a.status === 'resolved'
    return true
  })

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
            <p className="text-xs text-gray-500">Real-time anomaly detection from connected integrations</p>
          </div>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning...' : 'Run AI Scan'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Alerts', value: stats.active, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-900/20 border-red-800/40' },
          { label: 'Critical Issues', value: stats.critical, icon: XCircle, color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-800/40' },
          { label: 'AI Anomalies', value: stats.total, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-800/40' },
          { label: 'Auto-Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/20 border-green-800/40' },
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

      {/* Loading / Error / Empty states */}
      {loading && (
        <div className="text-center py-10 text-gray-400">
          <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
          Loading anomalies from connected integrations...
        </div>
      )}

      {!loading && error && (
        <div className="card border border-yellow-800/50 p-4 text-yellow-400 text-sm">
          <AlertTriangle size={16} className="inline mr-2" />
          {error}
        </div>
      )}

      {!loading && !error && anomalies.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <CheckCircle size={24} className="mx-auto mb-2 text-green-400" />
          No anomalies detected. Connect a cloud integration to enable real-time analysis.
        </div>
      )}

      {/* Anomaly list */}
      {!loading && (
        <div className="space-y-3">
          {displayed.map(a => {
            const sev = SEV_CONFIG[a.severity] || SEV_CONFIG.low
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
                      {a.cost_impact && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/30 text-yellow-300">{a.cost_impact}</span>
                      )}
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
      )}
    </div>
  )
}
