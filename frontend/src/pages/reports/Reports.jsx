import { useEffect, useState } from 'react'
import { RefreshCw, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

export default function Reports() {
  const [compliance, setCompliance] = useState([])
  const [expiring, setExpiring] = useState([])
  const [costs, setCosts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('compliance')

  const load = async () => {
    setLoading(true)
    try {
      const [c, e, co] = await Promise.all([api.get('/reports/software-compliance'), api.get('/reports/expiring-assets'), api.get('/reports/cost-analysis')])
      setCompliance(c.data.data)
      setExpiring(e.data.data)
      setCosts(co.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const tabs = [
    { id: 'compliance', label: 'License Compliance', icon: TrendingUp },
    { id: 'expiring', label: 'Expiring Assets', icon: AlertTriangle },
    { id: 'costs', label: 'Cost Analysis', icon: DollarSign },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports & Analytics</h1><p className="text-gray-500 dark:text-gray-400 mt-1">Comprehensive asset insights</p></div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} /> Refresh</button>
      </div>

      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
            <t.icon size={16} />{t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div> : (
        <>
          {activeTab === 'compliance' && (
            <div className="space-y-5">
              <div className="card p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">License Utilization by Application</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={compliance.slice(0, 12)} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total_licenses" fill="#3b82f6" radius={[4,4,0,0]} name="Total" />
                    <Bar dataKey="used_licenses" fill="#10b981" radius={[4,4,0,0]} name="Used" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="table-header">Application</th><th className="table-header">Vendor</th><th className="table-header">Total</th><th className="table-header">Used</th><th className="table-header">Available</th><th className="table-header">Utilization</th><th className="table-header">Monthly Cost</th>
                    </tr></thead>
                    <tbody>
                      {compliance.map(r => {
                        const pct = r.utilization_pct || 0
                        const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                        return (
                          <tr key={r.name} className="table-row">
                            <td className="table-cell font-medium text-gray-900 dark:text-white">{r.name}</td>
                            <td className="table-cell text-gray-500">{r.vendor}</td>
                            <td className="table-cell">{r.total_licenses}</td>
                            <td className="table-cell">{r.used_licenses}</td>
                            <td className="table-cell"><span className={r.available < 5 ? 'text-red-600 font-medium' : 'text-green-600'}>{r.available}</span></td>
                            <td className="table-cell">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 w-16"><div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${pct}%` }} /></div>
                                <span className="text-xs text-gray-500">{pct}%</span>
                              </div>
                            </td>
                            <td className="table-cell">${(r.total_cost || 0).toLocaleString()}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'expiring' && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="table-header">Asset</th><th className="table-header">Type</th><th className="table-header">Vendor</th><th className="table-header">Expiry Date</th><th className="table-header">Days Remaining</th>
                  </tr></thead>
                  <tbody>
                    {expiring.length === 0 ? <tr><td colSpan={5} className="text-center py-12 text-gray-400">No assets expiring in the next 90 days</td></tr>
                    : expiring.map((e, i) => (
                      <tr key={i} className="table-row">
                        <td className="table-cell font-medium text-gray-900 dark:text-white">{e.name}</td>
                        <td className="table-cell"><Badge variant={e.asset_type === 'software' ? 'info' : e.asset_type === 'contract' ? 'purple' : 'warning'}>{e.asset_type}</Badge></td>
                        <td className="table-cell text-gray-500">{e.vendor || '—'}</td>
                        <td className="table-cell">{new Date(e.expiry_date).toLocaleDateString()}</td>
                        <td className="table-cell"><span className={Math.round(e.days_remaining) <= 30 ? 'text-red-600 font-bold' : 'text-yellow-600 font-medium'}>{Math.round(e.days_remaining)} days</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'costs' && costs && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="card p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Software Costs by Category</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={costs.softwareCosts} dataKey="total_cost" nameKey="category" cx="50%" cy="50%" outerRadius={90} label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`} fontSize={11} labelLine={false}>
                      {costs.softwareCosts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Hardware Costs by Type</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={costs.hardwareCosts} margin={{ bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="type" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
                    <Bar dataKey="total_cost" fill="#8b5cf6" radius={[4,4,0,0]} name="Total Cost" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card p-5 lg:col-span-2">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Active Contract Value by Type</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {costs.contractCosts.map((c, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">${(c.total_value / 1000).toFixed(0)}K</p>
                      <p className="text-xs text-gray-500 mt-1">{c.type}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
