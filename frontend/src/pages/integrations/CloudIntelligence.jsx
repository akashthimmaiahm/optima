import { useEffect, useState } from 'react'
import { Search, RefreshCw, CheckCircle, XCircle, Eye, Zap, Shield, Server, TrendingDown, AlertTriangle } from 'lucide-react'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'
import { useAuth } from '../../contexts/AuthContext'

const riskVariant = { high: 'danger', medium: 'warning', low: 'success' }
const statusVariant = {
  detected: 'warning', under_review: 'info', resolved: 'success',
  pending: 'warning', completed: 'success', in_review: 'info',
  running: 'success', stopped: 'default', deallocated: 'default', active: 'success'
}

// ─── SaaS Discovery — real SKUs from connected integrations ───────────────
function DiscoveredApps({ canManage }) {
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    api.get('/cloud-intelligence/discovered-apps')
      .then(r => setApps(r.data.data || []))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const filtered = apps.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()))
  const totalSeats = apps.reduce((s, a) => s + (a.total_seats || 0), 0)
  const totalConsumed = apps.reduce((s, a) => s + (a.detected_users || 0), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{apps.length}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">License SKUs</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{totalSeats.toLocaleString()}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Seats</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{totalConsumed.toLocaleString()}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Seats Consumed</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{(totalSeats - totalConsumed).toLocaleString()}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Available Seats</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">${apps.reduce((s, a) => s + (a.monthly_cost || 0), 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Monthly Spend</p>
        </div>
      </div>

      <div className="card p-3 flex gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
          <input placeholder="Search license SKUs..." className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={15} /></button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">License / SKU</th>
                <th className="table-header">Source</th>
                <th className="table-header">Consumed</th>
                <th className="table-header">Total Seats</th>
                <th className="table-header">$/User/Mo</th>
                <th className="table-header">Monthly Cost</th>
                <th className="table-header">Usage</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">Loading from connected integrations...</td></tr>
                : filtered.length === 0
                  ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">No license SKUs found. Connect an integration first.</td></tr>
                  : filtered.map(a => {
                    const pct = a.total_seats > 0 ? Math.round((a.detected_users / a.total_seats) * 100) : 0
                    const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500'
                    return (
                      <tr key={a.id} className="table-row">
                        <td className="table-cell">
                          <p className="font-medium text-gray-900 dark:text-white">{a.name}</p>
                          <p className="text-xs text-gray-400">{a.sku}</p>
                        </td>
                        <td className="table-cell"><Badge variant="info">{a.source}</Badge></td>
                        <td className="table-cell font-bold text-gray-900 dark:text-white">{a.detected_users.toLocaleString()}</td>
                        <td className="table-cell text-gray-600 dark:text-gray-400">{a.total_seats.toLocaleString()}</td>
                        <td className="table-cell text-gray-600 dark:text-gray-400">
                          {a.price_per_user !== null ? `$${a.price_per_user.toFixed(2)}` : <span className="text-gray-400">Free</span>}
                        </td>
                        <td className="table-cell">
                          {a.monthly_cost !== null && a.monthly_cost > 0
                            ? <span className="font-semibold text-green-600">${a.monthly_cost.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                            : <span className="text-gray-400">$0</span>}
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 font-mono">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── License Reclamation ───────────────────────────────────────────────────
function LicenseReclamation({ canManage }) {
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [page, setPage] = useState(1)
  const perPage = 15

  const load = () => {
    setLoading(true)
    api.get('/cloud-intelligence/reclamation')
      .then(r => { setItems(r.data.data || []); setSummary(r.data.summary || {}) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const handleUpdate = async (id, status, action) => {
    await api.put(`/cloud-intelligence/reclamation/${id}`, { status, action_taken: action })
    load()
  }

  const handleScan = async () => {
    setScanning(true)
    try { const r = await api.post('/cloud-intelligence/reclamation/scan'); alert(r.data.message); load() } catch (e) { alert('Scan failed') }
    setScanning(false)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{summary.pending || 0}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Pending Review</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{summary.in_review || 0}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Under Review</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-red-600">${(summary.potential_savings || 0).toFixed(0)}<span className="text-sm font-normal">/mo</span></p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Potential Savings</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">${(summary.realized_savings || 0).toFixed(0)}<span className="text-sm font-normal">/mo</span></p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Savings Realized</p>
        </div>
      </div>

      {canManage && (
        <div className="flex justify-end">
          <button onClick={handleScan} disabled={scanning} className="btn-primary">
            <Zap size={16} />{scanning ? 'Scanning...' : 'Run Reclamation Scan'}
          </button>
        </div>
      )}

      {(() => {
        const totalPages = Math.ceil(items.length / perPage)
        const paged = items.slice((page - 1) * perPage, page * perPage)
        return (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">User</th>
                <th className="table-header">Software</th>
                <th className="table-header">Last Used</th>
                <th className="table-header">Days Inactive</th>
                <th className="table-header">Cost/mo</th>
                <th className="table-header">Status</th>
                {canManage && <th className="table-header">Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">Loading...</td></tr>
                : paged.length === 0
                  ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">No reclamation candidates found</td></tr>
                  : paged.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell">
                        <p className="font-medium text-gray-900 dark:text-white">{r.user_name}</p>
                        <p className="text-xs text-gray-400">{r.user_email}</p>
                      </td>
                      <td className="table-cell text-gray-600 dark:text-gray-400">{r.software_name}</td>
                      <td className="table-cell text-gray-500">{r.last_used ? new Date(r.last_used).toLocaleDateString() : '—'}</td>
                      <td className="table-cell">
                        <span className={r.days_inactive > 120 ? 'text-red-600 font-bold' : r.days_inactive > 60 ? 'text-yellow-600 font-medium' : 'text-gray-600'}>
                          {r.days_inactive}d
                        </span>
                      </td>
                      <td className="table-cell font-medium text-gray-900 dark:text-white">${r.license_cost?.toFixed(2)}</td>
                      <td className="table-cell"><Badge variant={statusVariant[r.status] || 'default'}>{r.status}</Badge></td>
                      {canManage && (
                        <td className="table-cell">
                          {r.status === 'pending' && (
                            <div className="flex gap-1">
                              <button onClick={() => handleUpdate(r.id, 'in_review', 'Under review')} className="btn-secondary text-xs py-1">
                                <Eye size={12} /> Review
                              </button>
                              <button onClick={() => handleUpdate(r.id, 'completed', 'License reclaimed')} className="btn-primary text-xs py-1">
                                <TrendingDown size={12} /> Reclaim
                              </button>
                            </div>
                          )}
                          {r.status === 'in_review' && (
                            <button onClick={() => handleUpdate(r.id, 'completed', 'License reclaimed - confirmed inactive')} className="btn-primary text-xs py-1">
                              <TrendingDown size={12} /> Reclaim
                            </button>
                          )}
                          {r.status === 'completed' && (
                            <span className="text-xs text-green-600 font-medium">Saved ${r.savings?.toFixed(2)}/mo</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500">Showing {(page-1)*perPage+1}-{Math.min(page*perPage, items.length)} of {items.length}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40">Prev</button>
              {Array.from({length: totalPages}, (_, i) => i+1).slice(Math.max(0, page-3), page+2).map(p => (
                <button key={p} onClick={() => setPage(p)} className={`px-2 py-1 text-xs rounded ${page===p ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
        )
      })()}
    </div>
  )
}

// ─── Cloud Infrastructure ──────────────────────────────────────────────────
function CloudResources({ canManage }) {
  const [resources, setResources] = useState([])
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [provider, setProvider] = useState('')
  const [scanning, setScanning] = useState(false)
  const [page, setPage] = useState(1)
  const perPage = 15

  const load = () => {
    setLoading(true)
    const params = provider ? `?provider=${provider}` : ''
    api.get(`/cloud-intelligence/cloud-resources${params}`)
      .then(r => { setResources(r.data.data || []); setSummary(r.data.summary || []) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [provider])

  const handleScan = async () => {
    setScanning(true)
    try { const r = await api.post('/cloud-intelligence/cloud-resources/scan'); alert(r.data.message); load() } catch (e) { alert('Scan failed') }
    setScanning(false)
  }

  const totalPages = Math.ceil(resources.length / perPage)
  const paged = resources.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {summary.map(s => (
          <div key={s.provider} className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-900 dark:text-white">{s.provider}</p>
              <Badge variant="info">{s.count} resources</Badge>
            </div>
            <p className="text-2xl font-bold text-blue-600">
              ${(s.monthly_cost || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}<span className="text-sm text-gray-400 font-normal">/mo</span>
            </p>
          </div>
        ))}
        {summary.length > 0 && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-900 dark:text-white">Total</p>
              <Badge variant="purple">{summary.reduce((s,r)=>s+r.count,0)} resources</Badge>
            </div>
            <p className="text-2xl font-bold text-purple-600">
              ${summary.reduce((s,r)=>s+(r.monthly_cost||0),0).toLocaleString(undefined, {maximumFractionDigits: 0})}<span className="text-sm text-gray-400 font-normal">/mo</span>
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-3 justify-between flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {['', 'Microsoft'].map(p => (
            <button key={p} onClick={() => { setProvider(p); setPage(1) }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${provider === p ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              {p || 'All Providers'}
            </button>
          ))}
        </div>
        {canManage && (
          <button onClick={handleScan} disabled={scanning} className="btn-secondary text-sm">
            <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'Scanning...' : 'Scan Infrastructure'}
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">Resource</th>
                <th className="table-header">Provider</th>
                <th className="table-header">Type</th>
                <th className="table-header">Consumed / Total</th>
                <th className="table-header">$/User/Mo</th>
                <th className="table-header">Monthly Cost</th>
                <th className="table-header">Status</th>
                <th className="table-header">Last Scanned</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">Loading...</td></tr>
                : paged.length === 0
                  ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">No cloud resources found</td></tr>
                  : paged.map(r => (
                    <tr key={r.id} className="table-row">
                      <td className="table-cell">
                        <p className="font-medium text-gray-900 dark:text-white">{r.resource_name}</p>
                        <p className="text-xs text-gray-400">{r.integration_name}</p>
                      </td>
                      <td className="table-cell"><Badge variant="purple">{r.provider}</Badge></td>
                      <td className="table-cell"><Badge variant="info">{r.resource_type}</Badge></td>
                      <td className="table-cell text-sm text-gray-900 dark:text-white font-medium">
                        {r.consumed || 0} / {r.enabled || 0}
                      </td>
                      <td className="table-cell text-gray-600 dark:text-gray-400">
                        {r.price_per_user > 0 ? `$${r.price_per_user.toFixed(2)}` : <span className="text-gray-400">Free</span>}
                      </td>
                      <td className="table-cell">
                        {r.monthly_cost > 0
                          ? <span className="font-semibold text-green-600">${r.monthly_cost.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                          : <span className="text-gray-400">$0</span>}
                      </td>
                      <td className="table-cell"><Badge variant={statusVariant[r.status] || 'default'}>{r.status}</Badge></td>
                      <td className="table-cell text-xs text-gray-400">
                        {r.last_scanned ? new Date(r.last_scanned).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500">Showing {(page-1)*perPage+1}-{Math.min(page*perPage, resources.length)} of {resources.length}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40">Prev</button>
              {Array.from({length: totalPages}, (_, i) => i+1).slice(Math.max(0, page-3), page+2).map(p => (
                <button key={p} onClick={() => setPage(p)} className={`px-2 py-1 text-xs rounded ${page===p ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shadow IT ─────────────────────────────────────────────────────────────
function ShadowIT({ canManage }) {
  const [apps, setApps] = useState([])
  const [summary, setSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const perPage = 15

  const load = () => {
    setLoading(true)
    api.get('/cloud-intelligence/shadow-it')
      .then(r => { setApps(r.data.data || []); setSummary(r.data.summary || {}) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const updateStatus = async (id, status) => {
    await api.put(`/cloud-intelligence/shadow-it/${id}`, { status })
    load()
  }

  const totalPages = Math.ceil(apps.length / perPage)
  const paged = apps.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total || 0}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Apps Detected</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{summary.high_risk || 0}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">High Risk</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{summary.medium_risk || 0}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Medium Risk</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">${(summary.total_monthly_cost || 0).toLocaleString()}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Est. Monthly Spend</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">Application</th>
                <th className="table-header">Category</th>
                <th className="table-header">Detected Via</th>
                <th className="table-header">Users</th>
                <th className="table-header">Risk</th>
                <th className="table-header">Monthly Cost</th>
                <th className="table-header">Status</th>
                {canManage && <th className="table-header">Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading
                ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">Loading...</td></tr>
                : paged.length === 0
                  ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">No shadow IT detected</td></tr>
                  : paged.map(a => (
                    <tr key={a.id} className="table-row">
                      <td className="table-cell">
                        <p className="font-medium text-gray-900 dark:text-white">{a.app_name}</p>
                        <p className="text-xs text-gray-400 max-w-xs truncate">{a.notes}</p>
                      </td>
                      <td className="table-cell"><Badge variant="info">{a.category}</Badge></td>
                      <td className="table-cell text-xs text-gray-500">{a.detected_via}</td>
                      <td className="table-cell font-medium text-gray-900 dark:text-white">{a.users_count}</td>
                      <td className="table-cell"><Badge variant={riskVariant[a.risk_level]}>{a.risk_level}</Badge></td>
                      <td className="table-cell">
                        {a.monthly_cost_estimate > 0
                          ? <span className="text-red-600 font-medium">${a.monthly_cost_estimate.toLocaleString()}</span>
                          : <span className="text-gray-400">$0</span>}
                      </td>
                      <td className="table-cell"><Badge variant={statusVariant[a.status] || 'default'}>{a.status.replace('_', ' ')}</Badge></td>
                      {canManage && (
                        <td className="table-cell">
                          {a.status === 'detected' && (
                            <button onClick={() => updateStatus(a.id, 'under_review')} className="btn-secondary text-xs py-1">
                              <Eye size={12} /> Review
                            </button>
                          )}
                          {a.status === 'under_review' && (
                            <button onClick={() => updateStatus(a.id, 'resolved')} className="btn-secondary text-xs py-1 text-green-600">
                              <CheckCircle size={12} /> Resolve
                            </button>
                          )}
                          {a.status === 'resolved' && (
                            <span className="text-xs text-green-600 font-medium">Resolved</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500">Showing {(page-1)*perPage+1}-{Math.min(page*perPage, apps.length)} of {apps.length}</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40">Prev</button>
              {Array.from({length: totalPages}, (_, i) => i+1).slice(Math.max(0, page-3), page+2).map(p => (
                <button key={p} onClick={() => setPage(p)} className={`px-2 py-1 text-xs rounded ${page===p ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>{p}</button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function CloudIntelligence() {
  const [summary, setSummary] = useState(null)
  const [activeTab, setActiveTab] = useState('saas')
  const { hasRole } = useAuth()
  const canManage = hasRole('super_admin', 'it_admin', 'it_manager')

  useEffect(() => {
    api.get('/cloud-intelligence/summary')
      .then(r => setSummary(r.data))
      .catch(() => {})
  }, [])

  const tabs = [
    { id: 'saas', label: 'SaaS Discovery', icon: Search },
    { id: 'reclamation', label: 'License Reclamation', icon: TrendingDown },
    { id: 'infrastructure', label: 'Cloud Infrastructure', icon: Server },
    { id: 'shadow', label: 'Shadow IT', icon: AlertTriangle },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cloud Intelligence</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          SaaS visibility, license reclamation, infrastructure discovery, and shadow IT detection
        </p>
      </div>

      {/* Top-level summary bar */}
      {summary && (
        <>
          {summary.org_name && (
            <div className="card p-3 flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Connected to:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{summary.org_name}</span>
              <span className="text-xs text-gray-400">via Microsoft 365</span>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: 'License SKUs', value: summary.discovered_apps, color: 'text-blue-600' },
              { label: 'Total Users', value: (summary.total_users || 0).toLocaleString(), color: 'text-purple-600' },
              { label: 'Licensed Users', value: (summary.licensed_users || 0).toLocaleString(), color: 'text-green-600' },
              { label: 'Total Seats', value: (summary.total_license_seats || 0).toLocaleString(), color: 'text-blue-600' },
              { label: 'Seats Used', value: (summary.consumed_license_seats || 0).toLocaleString(), color: 'text-yellow-600' },
              { label: 'Unused Seats', value: (summary.unused_license_seats || 0).toLocaleString(), color: 'text-red-600' },
              { label: 'Monthly Spend', value: `$${(summary.cloud_monthly_cost || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}`, color: 'text-green-600' },
              { label: 'Reclaim Candidates', value: summary.reclaim_candidates, color: 'text-orange-600' },
            ].map(s => (
              <div key={s.label} className="card p-3 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'saas' && <DiscoveredApps canManage={canManage} />}
      {activeTab === 'reclamation' && <LicenseReclamation canManage={canManage} />}
      {activeTab === 'infrastructure' && <CloudResources canManage={canManage} />}
      {activeTab === 'shadow' && <ShadowIT canManage={canManage} />}
    </div>
  )
}
