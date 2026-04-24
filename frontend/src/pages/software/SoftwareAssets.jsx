import { useEffect, useState } from 'react'
import { Plus, Search, Edit, Trash2, RefreshCw, Monitor, User, ChevronRight, Package, Cpu } from 'lucide-react'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { useAuth } from '../../contexts/AuthContext'

const statusVariant = { active: 'success', inactive: 'default', expired: 'danger', trial: 'warning' }
const licenseTypeColors = { subscription: 'info', perpetual: 'purple', trial: 'warning', usage: 'default', freeware: 'success', agent: 'default' }

const initialForm = { name: '', vendor: '', version: '', category: 'Productivity', license_type: 'subscription', total_licenses: 0, used_licenses: 0, cost_per_license: 0, purchase_date: '', expiry_date: '', description: '', department: '', status: 'active' }

export default function SoftwareAssets() {
  const [software, setSoftware] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLicenseType, setFilterLicenseType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(initialForm)
  const { hasRole } = useAuth()
  const canEdit = hasRole('super_admin', 'it_admin', 'it_manager', 'asset_manager')

  // Source tab state
  const [sourceTab, setSourceTab] = useState('all') // 'all' | 'manual' | 'agent'
  const [sourceStats, setSourceStats] = useState({ agent: 0, manual: 0, total: 0 })
  const [agents, setAgents] = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [deviceSearch, setDeviceSearch] = useState('')

  const load = () => {
    setLoading(true)
    const params = { search }
    if (sourceTab === 'agent') params.source = 'agent'
    else if (sourceTab === 'manual') params.source = 'manual'
    if (selectedAgent) params.agent_id = selectedAgent
    if (deviceSearch && sourceTab === 'agent') params.device_search = deviceSearch
    api.get('/software', { params }).then(r => setSoftware(r.data.data)).finally(() => setLoading(false))
  }

  const loadStats = () => {
    api.get('/software/source-stats').then(r => setSourceStats(r.data)).catch(() => {})
  }

  const loadAgents = () => {
    setAgentsLoading(true)
    api.get('/software/agents').then(r => setAgents(r.data.data || [])).catch(() => {}).finally(() => setAgentsLoading(false))
  }

  useEffect(() => { loadStats(); loadAgents() }, [])
  useEffect(() => { load() }, [search, sourceTab, selectedAgent, deviceSearch])

  const openAdd = () => { setEditItem(null); setForm(initialForm); setModalOpen(true) }
  const openEdit = (item) => { setEditItem(item); setForm({ ...item, purchase_date: item.purchase_date?.split('T')[0] || '', expiry_date: item.expiry_date?.split('T')[0] || '' }); setModalOpen(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editItem) await api.put(`/software/${editItem.id}`, form)
      else await api.post('/software', form)
      setModalOpen(false)
      load()
      loadStats()
    } catch (err) { alert(err.response?.data?.error || 'Error saving') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this software asset?')) return
    await api.delete(`/software/${id}`)
    load()
    loadStats()
  }

  const filteredSoftware = software.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.vendor?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterCategory && s.category !== filterCategory) return false
    if (filterLicenseType && s.license_type !== filterLicenseType) return false
    if (filterStatus && s.status !== filterStatus) return false
    return true
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Software Assets</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{sourceStats.total} software applications tracked</p>
        </div>
        {canEdit && <button onClick={openAdd} className="btn-primary"><Plus size={18} /> Add Software</button>}
      </div>

      {/* Source Tabs */}
      <div className="flex gap-2 items-center">
        {[
          { key: 'all', label: 'All Software', count: sourceStats.total, icon: Package },
          { key: 'manual', label: 'Manually Added', count: sourceStats.manual, icon: User },
          { key: 'agent', label: 'Agent Discovered', count: sourceStats.agent, icon: Cpu },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => { setSourceTab(tab.key); setSelectedAgent(null) }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
              sourceTab === tab.key
                ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20'
                : 'bg-white dark:bg-[#1a1a1f] border-gray-200 dark:border-[#2a2a35] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
              sourceTab === tab.key
                ? 'bg-white/20 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
            }`}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Agent filter bar (shown when agent tab is selected) */}
      {sourceTab === 'agent' && (
        <div className="card p-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Monitor size={16} />
            <span className="font-medium text-gray-300">Filter by Device:</span>
          </div>
          <select
            className="input w-56"
            value={selectedAgent || ''}
            onChange={e => { setSelectedAgent(e.target.value || null); setDeviceSearch('') }}
          >
            <option value="">All Devices ({sourceStats.agent} apps)</option>
            {agents.map(agent => (
              <option key={agent.agent_id} value={agent.agent_id}>
                {agent.hostname} ({agent.software_count} apps)
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              placeholder="Search by device name..."
              className="input pl-9 py-2 text-sm"
              value={deviceSearch}
              onChange={e => { setDeviceSearch(e.target.value); setSelectedAgent(null) }}
            />
          </div>
          {agents.length === 0 && !agentsLoading && (
            <span className="text-xs text-gray-500">No agent-discovered software yet. Install agents on endpoints.</span>
          )}
        </div>
      )}

      <div className="card p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input placeholder="Search software..." className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {['Productivity', 'Design', 'Development', 'Security', 'Communication', 'CRM', 'Cloud', 'OS', 'Engineering', 'Finance', 'Project Management', 'AI Platform', 'Discovered', 'Other'].map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="input w-40" value={filterLicenseType} onChange={e => setFilterLicenseType(e.target.value)}>
          <option value="">All License Types</option>
          {['subscription', 'perpetual', 'trial', 'usage', 'freeware', 'open_source', 'agent'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="input w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {['active', 'inactive', 'expired', 'trial'].map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={() => { load(); loadStats(); loadAgents() }} className="btn-secondary"><RefreshCw size={16} /></button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">Application</th>
                <th className="table-header">Source</th>
                <th className="table-header">Category</th>
                <th className="table-header">License Type</th>
                <th className="table-header">Licenses</th>
                <th className="table-header">Utilization</th>
                <th className="table-header">Cost/License</th>
                <th className="table-header">Expiry</th>
                <th className="table-header">Status</th>
                {canEdit && <th className="table-header">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : filteredSoftware.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">No software found</td></tr>
              ) : filteredSoftware.map(s => {
                const utilPct = s.total_licenses > 0 ? Math.round((s.used_licenses / s.total_licenses) * 100) : 0
                const barColor = utilPct >= 90 ? 'bg-red-500' : utilPct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                const isAgent = s.source === 'agent' || s.notes === 'Agent-discovered'
                return (
                  <tr key={s.id} className="table-row">
                    <td className="table-cell">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.vendor} {s.version && `v${s.version}`}</p>
                      </div>
                    </td>
                    <td className="table-cell">
                      {isAgent ? (
                        <div>
                          <Badge variant="purple">
                            <Cpu size={10} className="inline mr-1" />Agent
                          </Badge>
                          {s.agent_hostname && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[120px]" title={s.agent_hostname}>{s.agent_hostname}</p>
                          )}
                        </div>
                      ) : (
                        <Badge variant="info">
                          <User size={10} className="inline mr-1" />Manual
                        </Badge>
                      )}
                    </td>
                    <td className="table-cell"><Badge variant="info">{s.category}</Badge></td>
                    <td className="table-cell"><Badge variant={licenseTypeColors[s.license_type] || 'default'}>{s.license_type}</Badge></td>
                    <td className="table-cell">
                      <span className="text-gray-900 dark:text-white font-medium">{s.used_licenses}</span>
                      <span className="text-gray-400"> / {s.total_licenses}</span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 w-20">
                          <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${utilPct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{utilPct}%</span>
                      </div>
                    </td>
                    <td className="table-cell">{s.cost_per_license > 0 ? `$${s.cost_per_license.toFixed(2)}` : 'Free'}</td>
                    <td className="table-cell">
                      {s.expiry_date ? (
                        <span className={new Date(s.expiry_date) < new Date(Date.now() + 90*24*60*60*1000) ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-gray-500'}>
                          {new Date(s.expiry_date).toLocaleDateString()}
                        </span>
                      ) : <span className="text-gray-400">&mdash;</span>}
                    </td>
                    <td className="table-cell"><Badge variant={statusVariant[s.status] || 'default'}>{s.status}</Badge></td>
                    {canEdit && (
                      <td className="table-cell">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors"><Edit size={15} /></button>
                          <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-red-600 transition-colors"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Software' : 'Add Software'} size="lg">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="label">Application Name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><label className="label">Vendor</label><input className="input" value={form.vendor || ''} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} /></div>
          <div><label className="label">Version</label><input className="input" value={form.version || ''} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} /></div>
          <div><label className="label">Category</label>
            <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {['Productivity', 'Design', 'Development', 'Security', 'Communication', 'CRM', 'Cloud', 'OS', 'Engineering', 'Finance', 'Project Management', 'Other'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="label">License Type</label>
            <select className="input" value={form.license_type} onChange={e => setForm(f => ({ ...f, license_type: e.target.value }))}>
              {['subscription', 'perpetual', 'trial', 'usage', 'freeware', 'open_source'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Total Licenses</label><input type="number" className="input" value={form.total_licenses} onChange={e => setForm(f => ({ ...f, total_licenses: +e.target.value }))} /></div>
          <div><label className="label">Used Licenses</label><input type="number" className="input" value={form.used_licenses} onChange={e => setForm(f => ({ ...f, used_licenses: +e.target.value }))} /></div>
          <div><label className="label">Cost per License ($)</label><input type="number" step="0.01" className="input" value={form.cost_per_license} onChange={e => setForm(f => ({ ...f, cost_per_license: +e.target.value }))} /></div>
          <div><label className="label">Department</label><input className="input" value={form.department || ''} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} /></div>
          <div><label className="label">Purchase Date</label><input type="date" className="input" value={form.purchase_date || ''} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></div>
          <div><label className="label">Expiry Date</label><input type="date" className="input" value={form.expiry_date || ''} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} /></div>
          <div><label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {['active', 'inactive', 'expired', 'trial'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2"><label className="label">Description</label><textarea className="input" rows={2} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="col-span-2 flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editItem ? 'Update' : 'Add'} Software</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
