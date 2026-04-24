import { useEffect, useState } from 'react'
import {
  Monitor, HardDrive, Key, Cloud, Users, AlertTriangle, TrendingUp,
  DollarSign, TrendingDown, Zap, ShieldAlert, Target, ArrowRight,
  LayoutDashboard, Pencil, Check, X, GripVertical
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import StatsCard from '../components/common/StatsCard'
import Badge from '../components/common/Badge'
import api from '../api/axios'
import { useNavigate } from 'react-router-dom'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

const ALL_WIDGETS = [
  { id: 'asset_kpis',       label: 'Asset KPIs',          desc: 'Software, Hardware, Licenses, Users' },
  { id: 'operational_kpis', label: 'Operational KPIs',    desc: 'Cloud, Expiring Licenses, Utilization, Contracts' },
  { id: 'cost_cards',       label: 'Cost Cards',          desc: 'Spend, savings, shadow IT cost cards' },
  { id: 'optimization',     label: 'Optimization Panel',  desc: 'Score gauge, quick wins, top software cost' },
  { id: 'spend_chart',      label: 'Spend by Category',   desc: 'Monthly spend bar chart' },
  { id: 'wasted_licenses',  label: 'Underutilized Licenses', desc: 'Licenses costing money but unused' },
  { id: 'expiring_assets',  label: 'Expiring Assets',     desc: 'High-cost assets expiring soon' },
  { id: 'hardware_charts',  label: 'Hardware Charts',     desc: 'Hardware by status and value' },
  { id: 'cloud_infra',      label: 'Cloud Infrastructure', desc: 'Real-time cloud resources from integrations' },
  { id: 'recent_activity',  label: 'Recent Activity',     desc: 'Latest audit log entries' },
]

const DEFAULT_ENABLED = ALL_WIDGETS.map(w => w.id)

function loadWidgets() {
  try {
    const saved = localStorage.getItem('dashboard_widgets')
    if (saved) return JSON.parse(saved)
  } catch {}
  return DEFAULT_ENABLED
}

function ScoreGauge({ score }) {
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Needs Attention'
  return (
    <div className="flex flex-col items-center justify-center py-2">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="12" />
          <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="12"
            strokeDasharray={`${(score / 100) * 314} 314`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{score}</span>
          <span className="text-xs text-gray-500">/100</span>
        </div>
      </div>
      <p className="text-sm font-semibold mt-1" style={{ color }}>{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">Optimization Score</p>
    </div>
  )
}

function UtilBar({ pct }) {
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

function EditPanel({ enabled, onToggle, onClose, onReset }) {
  return (
    <div className="card p-5 mb-6 border-blue-200 dark:border-blue-700/40 bg-blue-50 dark:bg-[#0d1117]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={16} className="text-blue-400" />
          <span className="text-sm font-semibold text-white">Customize Dashboard</span>
          <span className="text-xs text-gray-500">Toggle widgets on or off</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onReset} className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded hover:bg-[#22222e] transition-colors">Reset</button>
          <button onClick={onClose} className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors">
            <Check size={12} /> Done
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {ALL_WIDGETS.map(w => {
          const on = enabled.includes(w.id)
          return (
            <button
              key={w.id}
              onClick={() => onToggle(w.id)}
              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${on ? 'border-blue-600/50 bg-blue-600/10' : 'border-gray-200 dark:border-[#2a2a35] bg-gray-100 dark:bg-[#16161e] opacity-50'}`}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-blue-600 border-blue-600' : 'border-gray-600'}`}>
                {on && <Check size={10} className="text-white" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">{w.label}</p>
                <p className="text-xs text-gray-500 truncate">{w.desc}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [enabledWidgets, setEnabledWidgets] = useState(loadWidgets)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(r => { setStats(r.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const toggleWidget = (id) => {
    setEnabledWidgets(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      localStorage.setItem('dashboard_widgets', JSON.stringify(next))
      return next
    })
  }

  const resetWidgets = () => {
    setEnabledWidgets(DEFAULT_ENABLED)
    localStorage.setItem('dashboard_widgets', JSON.stringify(DEFAULT_ENABLED))
  }

  const show = (id) => enabledWidgets.includes(id)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  const c = stats?.cost || {}

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 mt-0.5 text-sm">Optima — Enterprise Asset Management</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 hidden sm:block">
            Updated {new Date().toLocaleString()}
          </span>
          <button
            onClick={() => setEditing(e => !e)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${editing ? 'bg-blue-600 border-blue-600 text-white' : 'border-[#2a2a35] text-gray-400 hover:text-gray-200 hover:bg-[#22222e]'}`}
          >
            <Pencil size={12} /> {editing ? 'Editing…' : 'Edit Dashboard'}
          </button>
        </div>
      </div>

      {/* Edit panel */}
      {editing && (
        <EditPanel
          enabled={enabledWidgets}
          onToggle={toggleWidget}
          onClose={() => setEditing(false)}
          onReset={resetWidgets}
        />
      )}

      {/* ── Asset KPIs ── */}
      {show('asset_kpis') && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatsCard title="Software Assets" value={stats?.totalSoftware || 0} subtitle="Tracked applications" icon={Monitor} color="blue" />
          <StatsCard title="Hardware Assets" value={stats?.totalHardware || 0} subtitle={`${stats?.inRepairHardware || 0} in repair`} icon={HardDrive} color="purple" />
          <StatsCard title="Total Licenses" value={(stats?.totalLicenses || 0).toLocaleString()} subtitle={`${stats?.usedLicenses || 0} in use`} icon={Key} color="green" />
          <StatsCard title="Active Users" value={stats?.totalUsers || 0} subtitle="System users" icon={Users} color="orange" />
        </div>
      )}

      {/* ── Operational KPIs ── */}
      {show('operational_kpis') && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatsCard title="Cloud Integrations" value={stats?.connectedIntegrations || 0} subtitle={stats?.cloud?.providers?.length ? stats.cloud.providers.join(', ') : 'Connected apps'} icon={Cloud} color="blue" />
          <StatsCard title="Expiring Licenses" value={stats?.expiringLicenses || 0} subtitle="Within 90 days" icon={AlertTriangle} color="yellow" />
          <StatsCard title="License Utilization" value={`${stats?.licenseCompliance || 0}%`} subtitle="Across all software" icon={TrendingUp} color="green" />
          <StatsCard title="Active Contracts" value={`$${((stats?.totalContractValue || 0) / 1000).toFixed(0)}K`} subtitle={`${stats?.expiringContracts || 0} expiring soon`} icon={DollarSign} color="purple" />
        </div>
      )}

      {/* ── Cost Cards ── */}
      {show('cost_cards') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <DollarSign size={16} className="text-green-500" /> Cost Overview
            </h2>
            <button onClick={() => navigate('/cloud-intelligence')} className="text-xs text-blue-400 hover:underline flex items-center gap-1">
              Full Analysis <ArrowRight size={11} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { label: 'Software Spend',   value: `$${(c.softwareMonthly || 0).toLocaleString()}`,                sub: 'per month',       color: 'text-blue-400',   bg: 'bg-blue-900/20' },
              { label: 'Cloud Spend',      value: `$${(c.cloudMonthly || 0).toLocaleString()}`,                   sub: 'per month',       color: 'text-purple-400', bg: 'bg-purple-900/20' },
              { label: 'Hardware Value',   value: `$${((c.hardwareTotal || 0) / 1000).toFixed(0)}K`,              sub: 'total assets',    color: 'text-orange-400', bg: 'bg-orange-900/20' },
              { label: 'Wasted Licenses',  value: `$${(c.wastedLicenseCost || 0).toLocaleString()}`,             sub: 'underutilized',   color: 'text-red-400',    bg: 'bg-red-900/20' },
              { label: 'Potential Savings',value: `$${(c.potentialSavings || 0).toLocaleString()}`,              sub: 'can be saved',    color: 'text-green-400',  bg: 'bg-green-900/20' },
              { label: 'Shadow IT Cost',   value: `$${(stats?.shadowIT?.monthlyCost || c.shadowCost || 0).toLocaleString()}`, sub: `${stats?.shadowIT?.count || 0} risks detected`, color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
            ].map(k => (
              <div key={k.label} className={`rounded-xl p-4 ${k.bg}`}>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs font-medium text-gray-300 mt-0.5">{k.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Optimization Panel + Spend Chart ── */}
      {(show('optimization') || show('spend_chart')) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {show('optimization') && (
            <div className="card p-5 flex flex-col gap-4">
              <ScoreGauge score={c.optimizationScore || 0} />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quick Wins</p>
                {[
                  { label: 'Reclaim unused licenses',    value: `Save $${(c.reclaimPotential || 0).toFixed(0)}/mo`,        color: 'text-green-400',  icon: TrendingDown, action: () => navigate('/cloud-intelligence') },
                  { label: 'Review underutilized apps',  value: `${(c.wastedLicenses || []).length} apps`,                  color: 'text-yellow-400', icon: Target,       action: () => navigate('/licenses') },
                  { label: 'Resolve Shadow IT',          value: `${stats?.shadowIT?.count || 0} risks — $${(stats?.shadowIT?.monthlyCost || c.shadowCost || 0).toFixed(0)}/mo`, color: 'text-red-400', icon: ShieldAlert, action: () => navigate('/cloud-intelligence') },
                  { label: 'Renew expiring contracts',   value: `${stats?.expiringContracts || 0} contracts`,              color: 'text-orange-400', icon: AlertTriangle,action: () => navigate('/contracts') },
                ].map(w => (
                  <button key={w.label} onClick={w.action} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#22222e] transition-colors text-left">
                    <w.icon size={14} className={w.color} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-300 truncate">{w.label}</p>
                      <p className={`text-xs font-bold ${w.color}`}>{w.value}</p>
                    </div>
                    <ArrowRight size={12} className="text-gray-600 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {show('spend_chart') && (
            <div className={`card p-5 ${show('optimization') ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
              <h3 className="font-semibold text-white mb-4 text-sm">Monthly Spend by Category</h3>
              <ResponsiveContainer width="100%" height={show('optimization') ? 240 : 200}>
                <BarChart data={c.spendByCategory || []} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#2a2a35" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: '#9ca3af' }} width={90} />
                  <Tooltip
                    contentStyle={{ background: 'var(--tooltip-bg, #1a1a1f)', border: '1px solid var(--tooltip-border, #2a2a35)', borderRadius: 8 }}
                    labelStyle={{ color: 'var(--tooltip-text, #fff)' }}
                    formatter={v => [`$${v.toLocaleString()}`, 'Monthly Cost']}
                  />
                  <Bar dataKey="monthly_cost" radius={[0, 4, 4, 0]}>
                    {(c.spendByCategory || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Top software cost (standalone if optimization hidden) */}
      {show('optimization') && (c.topSoftwareCost || []).length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 text-sm">Top Software by Cost</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {(c.topSoftwareCost || []).map((s, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-gray-500 w-4">#{i + 1}</span>
                    <p className="text-xs font-medium text-gray-300 truncate">{s.name}</p>
                  </div>
                  <p className="text-xs font-bold text-white ml-2 flex-shrink-0">${(s.monthly_cost || 0).toLocaleString()}<span className="text-gray-500 font-normal">/mo</span></p>
                </div>
                <UtilBar pct={s.utilization_pct || 0} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Underutilized Licenses ── */}
      {show('wasted_licenses') && (c.wastedLicenses || []).length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-[#2a2a35]">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <TrendingDown size={16} className="text-red-400" /> Underutilized Licenses
            </h3>
            <Badge variant="danger">${(c.wastedLicenseCost || 0).toLocaleString()}/mo wasted</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2a2a35]">
                  <th className="table-header">Software</th>
                  <th className="table-header">Total</th>
                  <th className="table-header">Used</th>
                  <th className="table-header">Utilization</th>
                  <th className="table-header">Wasted Cost</th>
                  <th className="table-header">Action</th>
                </tr>
              </thead>
              <tbody>
                {(c.wastedLicenses || []).map((w, i) => (
                  <tr key={i} className="table-row">
                    <td className="table-cell">
                      <p className="font-medium text-white">{w.name}</p>
                      <p className="text-xs text-gray-500">{w.vendor}</p>
                    </td>
                    <td className="table-cell text-gray-400">{w.total_licenses}</td>
                    <td className="table-cell text-gray-400">{w.used_licenses}</td>
                    <td className="table-cell w-32"><UtilBar pct={w.utilization_pct || 0} /></td>
                    <td className="table-cell">
                      <span className="text-red-400 font-bold">${(w.wasted_cost || 0).toLocaleString()}</span>
                      <span className="text-xs text-gray-500">/mo</span>
                    </td>
                    <td className="table-cell">
                      <button onClick={() => navigate('/cloud-intelligence')} className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                        Reclaim <ArrowRight size={10} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Expiring Assets ── */}
      {show('expiring_assets') && (c.expiringCostlyAssets || []).length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-white text-sm mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" /> High-Cost Assets Expiring Soon
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(c.expiringCostlyAssets || []).map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#2a2a35] rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.days_left <= 30 ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-200">{a.name}</p>
                    <p className="text-xs text-gray-500">{a.vendor}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <p className="text-sm font-bold text-white">${(a.monthly_cost || 0).toLocaleString()}/mo</p>
                  <p className={`text-xs font-medium ${a.days_left <= 30 ? 'text-red-400' : 'text-yellow-400'}`}>{a.days_left}d left</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hardware Charts ── */}
      {show('hardware_charts') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card p-5">
            <h3 className="font-semibold text-white mb-4 text-sm">Hardware by Status</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats?.hardwareByStatus || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ background: 'var(--tooltip-bg, #1a1a1f)', border: '1px solid var(--tooltip-border, #2a2a35)', borderRadius: 8 }} labelStyle={{ color: 'var(--tooltip-text, #fff)' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-white mb-4 text-sm">Hardware Value by Type</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={(c.hardwareCostByType || []).slice(0, 6)} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#2a2a35" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: '#9ca3af' }} width={80} />
                <Tooltip contentStyle={{ background: 'var(--tooltip-bg, #1a1a1f)', border: '1px solid var(--tooltip-border, #2a2a35)', borderRadius: 8 }} labelStyle={{ color: 'var(--tooltip-text, #fff)' }} formatter={v => [`$${v.toLocaleString()}`, 'Total Value']} />
                <Bar dataKey="total_cost" radius={[0, 4, 4, 0]}>
                  {(c.hardwareCostByType || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Cloud Infrastructure ── */}
      {show('cloud_infra') && stats?.cloud && stats.cloud.providers.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Cloud size={16} className="text-blue-400" /> Cloud Infrastructure
            </h3>
            <div className="flex items-center gap-2">
              {stats.cloud.providers.map(p => (
                <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400 border border-blue-700/30">{p}</span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'EC2 Instances',    value: stats.cloud.resources.ec2,          color: 'text-orange-400', bg: 'bg-orange-900/20', show: stats.cloud.resources.ec2 > 0 },
              { label: 'S3 Buckets',       value: stats.cloud.resources.s3,           color: 'text-green-400',  bg: 'bg-green-900/20',  show: stats.cloud.resources.s3 > 0 },
              { label: 'IAM Users',        value: stats.cloud.resources.iamUsers,     color: 'text-purple-400', bg: 'bg-purple-900/20', show: stats.cloud.resources.iamUsers > 0 },
              { label: 'IAM Roles',        value: stats.cloud.resources.iamRoles,     color: 'text-cyan-400',   bg: 'bg-cyan-900/20',   show: stats.cloud.resources.iamRoles > 0 },
              { label: 'M365 Users',       value: stats.cloud.resources.m365Users,    color: 'text-blue-400',   bg: 'bg-blue-900/20',   show: stats.cloud.resources.m365Users > 0 },
              { label: 'M365 Licenses',    value: stats.cloud.resources.m365Licenses, color: 'text-indigo-400', bg: 'bg-indigo-900/20', show: stats.cloud.resources.m365Licenses > 0 },
            ].filter(r => r.show).map(r => (
              <div key={r.label} className={`rounded-xl p-4 ${r.bg}`}>
                <p className={`text-2xl font-bold ${r.color}`}>{r.value}</p>
                <p className="text-xs font-medium text-gray-300 mt-1">{r.label}</p>
              </div>
            ))}
            <div className="rounded-xl p-4 bg-green-900/20">
              <p className="text-2xl font-bold text-green-400">${(stats.cloud.totalCloudCost || 0).toLocaleString()}</p>
              <p className="text-xs font-medium text-gray-300 mt-1">Est. Monthly Cost</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Activity ── */}
      {show('recent_activity') && (
        <div className="card p-5">
          <h3 className="font-semibold text-white mb-4 text-sm">Recent Activity</h3>
          <div className="space-y-2">
            {(stats?.recentAuditLogs || []).length === 0
              ? <p className="text-gray-500 text-sm text-center py-4">No recent activity</p>
              : (stats?.recentAuditLogs || []).map(log => (
                <div key={log.id} className="flex items-center gap-3 py-2 border-b border-[#2a2a35] last:border-0">
                  <div className="w-7 h-7 bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-blue-400">{log.user_name?.[0] || '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">
                      <span className="font-medium text-white">{log.user_name}</span> — {log.details}
                    </p>
                    <p className="text-xs text-gray-500">{new Date(log.created_at).toLocaleString()}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
