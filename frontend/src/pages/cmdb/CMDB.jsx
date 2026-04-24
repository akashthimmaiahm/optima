import { useState, useEffect, useCallback } from 'react'
import api from '../../api/axios'
import {
  Database, Server, Monitor, HardDrive, Cloud, Globe, Cpu,
  Plus, Search, RefreshCw, GitBranch, ChevronRight, ChevronDown,
  Edit2, Trash2, X, Info, Box, Link2, ArrowRight, ArrowLeft, Check, AlertTriangle
} from 'lucide-react'

// ── constants ────────────────────────────────────────────────────────────────

const TYPE_ICONS = {
  'Server': Server, 'Network': HardDrive, 'Application': Monitor,
  'Virtual Machine': Cloud, 'Storage': Database, 'Service': Globe,
  'Hardware': Cpu, 'Database': Database,
}
const CRITICALITY_COLORS = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  low: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}
const STATUS_COLORS = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  maintenance: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  retired: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
}
const ENV_COLORS = {
  production: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  staging: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  development: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  dr: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}
const TYPES = ['Server', 'Network', 'Application', 'Virtual Machine', 'Storage', 'Service', 'Hardware', 'Database']
const ENVIRONMENTS = ['production', 'staging', 'development', 'dr']
const CRITICALITIES = ['critical', 'high', 'medium', 'low']
const STATUSES = ['active', 'inactive', 'maintenance', 'retired']
const REL_TYPES = [
  'depends_on', 'connected_to', 'uses', 'hosts', 'monitors', 'backs_up',
  'authenticates_via', 'routes_to', 'replicates_to', 'deploys_to',
  'fronts', 'integrated_with', 'triggers', 'mirrors', 'behind',
]

// ── small helpers ─────────────────────────────────────────────────────────────

function Badge({ label, colorClass }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>{label}</span>
}

function CIIcon({ type, size = 16 }) {
  const Icon = TYPE_ICONS[type] || Box
  return <Icon size={size} />
}

function Field({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{value}</p>
    </div>
  )
}

// ── CI Form (inline, not a modal) ─────────────────────────────────────────────

function CIForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', type: 'Server', category: '', status: 'active', environment: 'production',
    criticality: 'medium', owner: '', department: '', location: '', ip_address: '',
    os: '', version: '', description: '', managed_by: '',
    ...initial,
    tags: Array.isArray(initial?.tags) ? initial.tags.join(', ') : (initial?.tags || ''),
  })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const inp = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">{initial?.id ? 'Edit Configuration Item' : 'New Configuration Item'}</h3>
        <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name *</label>
          <input value={form.name} onChange={set('name')} className={inp} placeholder="e.g. Primary Web Server" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
          <select value={form.type} onChange={set('type')} className={inp}>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category</label>
          <input value={form.category} onChange={set('category')} className={inp} placeholder="e.g. Web Server" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status</label>
          <select value={form.status} onChange={set('status')} className={inp}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Environment</label>
          <select value={form.environment} onChange={set('environment')} className={inp}>{ENVIRONMENTS.map(e => <option key={e}>{e}</option>)}</select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Criticality</label>
          <select value={form.criticality} onChange={set('criticality')} className={inp}>{CRITICALITIES.map(c => <option key={c}>{c}</option>)}</select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Owner</label>
          <input value={form.owner} onChange={set('owner')} className={inp} placeholder="Owner" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Department</label>
          <input value={form.department} onChange={set('department')} className={inp} placeholder="Department" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Location</label>
          <input value={form.location || ''} onChange={set('location')} className={inp} placeholder="e.g. Data Center Rack A1" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">IP Address</label>
          <input value={form.ip_address || ''} onChange={set('ip_address')} className={inp} placeholder="10.0.0.1" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">OS / Platform</label>
          <input value={form.os || ''} onChange={set('os')} className={inp} placeholder="Ubuntu 22.04" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Version</label>
          <input value={form.version || ''} onChange={set('version')} className={inp} placeholder="1.0" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Managed By</label>
          <input value={form.managed_by || ''} onChange={set('managed_by')} className={inp} placeholder="Team or person" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tags (comma-separated)</label>
          <input value={form.tags} onChange={set('tags')} className={inp} placeholder="production, web, dmz" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
          <textarea value={form.description || ''} onChange={set('description')} rows={2} className={inp} placeholder="Brief description" />
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={() => onSave({ ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) })}
          disabled={!form.name}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
          {initial?.id ? 'Update CI' : 'Create CI'}
        </button>
        <button onClick={onCancel} className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 py-2 rounded-lg text-sm font-medium transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── CI Detail Panel ───────────────────────────────────────────────────────────

function CIDetail({ ci, onClose, onEdit, onManageRel }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white flex-shrink-0">
            <CIIcon type={ci.type} size={20} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">{ci.name}</h3>
            <p className="text-xs font-mono text-blue-600 dark:text-blue-400">{ci.ci_id}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-gray-700 text-gray-500"><X size={16} /></button>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2 px-5 pt-4">
        <Badge label={ci.status} colorClass={STATUS_COLORS[ci.status] || ''} />
        <Badge label={ci.criticality} colorClass={CRITICALITY_COLORS[ci.criticality] || ''} />
        <Badge label={ci.environment} colorClass={ENV_COLORS[ci.environment] || ''} />
        <Badge label={ci.type} colorClass="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400" />
      </div>

      {/* Description */}
      {ci.description && <p className="text-sm text-gray-600 dark:text-gray-400 px-5 pt-3">{ci.description}</p>}

      {/* Fields grid */}
      <div className="grid grid-cols-2 gap-3 p-5">
        <Field label="Category" value={ci.category} />
        <Field label="Owner" value={ci.owner} />
        <Field label="Department" value={ci.department} />
        <Field label="Managed By" value={ci.managed_by} />
        <Field label="Location" value={ci.location} />
        <Field label="IP Address" value={ci.ip_address} />
        <Field label="OS / Platform" value={ci.os} />
        <Field label="Version" value={ci.version} />
      </div>

      {/* Tags */}
      {ci.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 px-5 pb-4">
          {ci.tags.map(t => (
            <span key={t} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 text-xs rounded-full border border-blue-100 dark:border-blue-800">{t}</span>
          ))}
        </div>
      )}

      {/* Relationships */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Dependencies &amp; Relationships</p>
          <button onClick={onManageRel} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
            <Link2 size={12} /> Manage
          </button>
        </div>

        {(ci.relationships?.outgoing || []).length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Depends On / Connects To</p>
            {ci.relationships.outgoing.map(r => (
              <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <ArrowRight size={12} className="text-blue-400 flex-shrink-0" />
                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize w-24 truncate">{r.relationship_type.replace(/_/g, ' ')}</span>
                <span className="text-xs font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">{r.target_name}</span>
                <Badge label={r.target_status || 'active'} colorClass={STATUS_COLORS[r.target_status] || STATUS_COLORS.active} />
              </div>
            ))}
          </div>
        )}

        {(ci.relationships?.incoming || []).length > 0 && (
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Used By / Depended On By</p>
            {ci.relationships.incoming.map(r => (
              <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                <ArrowLeft size={12} className="text-purple-400 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-800 dark:text-gray-200 flex-1 truncate">{r.source_name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 capitalize w-24 text-right truncate">{r.relationship_type.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}

        {!(ci.relationships?.outgoing?.length) && !(ci.relationships?.incoming?.length) && (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">No relationships defined yet. Click Manage to add.</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-5 pb-5">
        <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors">
          <Edit2 size={14} /> Edit CI
        </button>
        <button onClick={onManageRel} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-medium transition-colors">
          <GitBranch size={14} /> Relationships
        </button>
      </div>
    </div>
  )
}

// ── Relationship Manager (inline) ─────────────────────────────────────────────

function RelationshipManager({ ci, allItems, onClose, onRefresh }) {
  const [relType, setRelType] = useState('depends_on')
  const [targetId, setTargetId] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const others = allItems.filter(i => i.id !== ci.id)

  const inp = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  const handleAdd = async () => {
    if (!targetId) return
    setSaving(true)
    await api.post('/cmdb/relationships', {
      source_ci_id: ci.id,
      target_ci_id: parseInt(targetId),
      relationship_type: relType,
      description: desc,
    })
    setSaving(false)
    setTargetId(''); setDesc('')
    onRefresh()
  }

  const handleDelete = async (id) => {
    setDeletingId(id)
    await api.delete(`/cmdb/relationships/${id}`)
    setDeletingId(null)
    onRefresh()
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white">Manage Relationships</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">{ci.name} · {ci.ci_id}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X size={16} /></button>
      </div>

      <div className="p-5 space-y-5">
        {/* Outgoing */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Outgoing ({ci.relationships?.outgoing?.length || 0})
          </p>
          {(ci.relationships?.outgoing || []).length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500 italic">None</p>
            : (ci.relationships.outgoing).map(r => (
              <div key={r.id} className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-700">
                <ArrowRight size={14} className="text-blue-400 flex-shrink-0" />
                <span className="text-sm text-gray-500 dark:text-gray-400 capitalize w-28 truncate">{r.relationship_type.replace(/_/g, ' ')}</span>
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">{r.target_name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{r.target_ci_id}</span>
                <button onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors disabled:opacity-40">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
        </div>

        {/* Incoming */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Incoming ({ci.relationships?.incoming?.length || 0})
          </p>
          {(ci.relationships?.incoming || []).length === 0
            ? <p className="text-sm text-gray-400 dark:text-gray-500 italic">None</p>
            : (ci.relationships.incoming).map(r => (
              <div key={r.id} className="flex items-center gap-2 py-2 border-b border-gray-100 dark:border-gray-700">
                <ArrowLeft size={14} className="text-purple-400 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">{r.source_name}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">{r.relationship_type.replace(/_/g, ' ')}</span>
              </div>
            ))}
        </div>

        {/* Add new */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Add New Relationship</p>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Relationship Type</label>
                <select value={relType} onChange={e => setRelType(e.target.value)} className={inp}>
                  {REL_TYPES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Target CI</label>
                <select value={targetId} onChange={e => setTargetId(e.target.value)} className={inp}>
                  <option value="">— select —</option>
                  {others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            </div>
            <input value={desc} onChange={e => setDesc(e.target.value)} className={inp} placeholder="Description (optional)" />
            <button onClick={handleAdd} disabled={!targetId || saving}
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
              {saving ? 'Adding…' : 'Add Relationship'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main CMDB page ────────────────────────────────────────────────────────────

export default function CMDB() {
  const [stats, setStats] = useState(null)
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCrit, setFilterCrit] = useState('')
  const [filterEnv, setFilterEnv] = useState('')
  const [page, setPage] = useState(1)

  // right panel state
  const [panelMode, setPanelMode] = useState(null) // 'detail' | 'edit' | 'new' | 'rel'
  const [selectedCI, setSelectedCI] = useState(null)

  const [discovering, setDiscovering] = useState(false)
  const PAGE_SIZE = 20

  const loadStats = useCallback(() => {
    api.get('/cmdb/stats').then(r => setStats(r.data)).catch(() => {})
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: PAGE_SIZE }
      if (search) params.search = search
      if (filterType) params.type = filterType
      if (filterStatus) params.status = filterStatus
      if (filterCrit) params.criticality = filterCrit
      if (filterEnv) params.environment = filterEnv
      const r = await api.get('/cmdb/items', { params })
      setItems(r.data.items)
      setTotal(r.data.total)
    } catch (e) {}
    setLoading(false)
  }, [search, filterType, filterStatus, filterCrit, filterEnv, page])

  useEffect(() => { loadStats(); loadItems() }, [loadStats, loadItems])

  const openDetail = async (id) => {
    const r = await api.get(`/cmdb/items/${id}`)
    setSelectedCI(r.data)
    setPanelMode('detail')
  }

  const openRel = async (id) => {
    const r = await api.get(`/cmdb/items/${id}`)
    setSelectedCI(r.data)
    setPanelMode('rel')
  }

  const refreshSelected = async () => {
    if (!selectedCI) return
    const r = await api.get(`/cmdb/items/${selectedCI.id}`)
    setSelectedCI(r.data)
  }

  const handleSave = async (data) => {
    if (selectedCI?.id) {
      await api.put(`/cmdb/items/${selectedCI.id}`, data)
    } else {
      await api.post('/cmdb/items', data)
    }
    setPanelMode(null)
    setSelectedCI(null)
    loadStats()
    loadItems()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this CI and all its relationships?')) return
    await api.delete(`/cmdb/items/${id}`)
    if (selectedCI?.id === id) { setPanelMode(null); setSelectedCI(null) }
    loadStats()
    loadItems()
  }

  const handleDiscover = async () => {
    setDiscovering(true)
    try {
      const r = await api.post('/cmdb/discover')
      alert(r.data.message)
      loadStats()
      loadItems()
    } catch (e) {}
    setDiscovering(false)
  }

  const closePanel = () => { setPanelMode(null); setSelectedCI(null) }
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const showPanel = !!panelMode

  return (
    <div className="flex gap-6 h-full">
      {/* Left: main content */}
      <div className={`flex-1 min-w-0 space-y-5 ${showPanel ? 'max-w-[calc(100%-26rem)]' : ''}`}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CMDB</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Configuration Management Database</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDiscover} disabled={discovering}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors">
              <RefreshCw size={15} className={discovering ? 'animate-spin' : ''} />
              {discovering ? 'Scanning…' : 'Discover Assets'}
            </button>
            <button onClick={() => { setSelectedCI(null); setPanelMode('new') }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus size={15} /> Add CI
            </button>
          </div>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: 'Total CIs', value: stats.total, color: 'bg-blue-600' },
              { label: 'Critical', value: stats.critical, color: 'bg-red-500' },
              { label: 'Relationships', value: stats.totalRelationships, color: 'bg-purple-500' },
              ...(stats.byType || []).slice(0, 3).map(t => ({ label: t.type, value: t.count, color: 'bg-teal-500' }))
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                placeholder="Search name, CI ID, owner…" />
            </div>
            {[
              { label: 'Type', val: filterType, set: v => { setFilterType(v); setPage(1) }, opts: TYPES },
              { label: 'Status', val: filterStatus, set: v => { setFilterStatus(v); setPage(1) }, opts: STATUSES },
              { label: 'Criticality', val: filterCrit, set: v => { setFilterCrit(v); setPage(1) }, opts: CRITICALITIES },
              { label: 'Environment', val: filterEnv, set: v => { setFilterEnv(v); setPage(1) }, opts: ENVIRONMENTS },
            ].map(f => (
              <select key={f.label} value={f.val} onChange={e => f.set(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm">
                <option value="">All {f.label}s</option>
                {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">{total} configuration items — <span className="text-blue-600 dark:text-blue-400">click any row to view details</span></p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/40 text-left">
                  {['CI ID', 'Name & Type', 'Status', 'Criticality', 'Environment', 'Owner', 'Rel.', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">Loading…</td></tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-14 text-center">
                      <Database size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                      <p className="font-medium text-gray-500 dark:text-gray-400">No configuration items found</p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Click <strong>Discover Assets</strong> to auto-import from Hardware &amp; Software</p>
                    </td>
                  </tr>
                ) : items.map(item => {
                  const isSelected = selectedCI?.id === item.id
                  return (
                    <tr
                      key={item.id}
                      onClick={() => openDetail(item.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}`}
                    >
                      <td className="px-4 py-3 text-xs font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">{item.ci_id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 dark:text-gray-500 flex-shrink-0"><CIIcon type={item.type} size={15} /></span>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">{item.type}{item.category ? ` · ${item.category}` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge label={item.status} colorClass={STATUS_COLORS[item.status] || ''} /></td>
                      <td className="px-4 py-3"><Badge label={item.criticality} colorClass={CRITICALITY_COLORS[item.criticality] || ''} /></td>
                      <td className="px-4 py-3"><Badge label={item.environment} colorClass={ENV_COLORS[item.environment] || ''} /></td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{item.owner || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); openRel(item.id) }}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium transition-colors"
                          title="Manage relationships"
                        >
                          <GitBranch size={12} />
                          <span>{item.relationship_count}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { setSelectedCI(item); setPanelMode('edit') }}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-medium transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="flex items-center gap-1 px-2 py-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 dark:text-red-400 rounded-lg text-xs font-medium transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40">
                  ← Previous
                </button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40">
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Type/Criticality/Env charts */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { title: 'By Type', data: stats.byType || [], key: 'type', color: 'bg-blue-500' },
              { title: 'By Criticality', data: stats.byCriticality || [], key: 'criticality', colors: { critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-yellow-400', low: 'bg-green-400' } },
              { title: 'By Environment', data: stats.byEnvironment || [], key: 'environment', color: 'bg-purple-500' },
            ].map(({ title, data, key, color, colors }) => (
              <div key={title} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">{title}</p>
                <div className="space-y-2">
                  {data.map(d => {
                    const pct = stats.total > 0 ? Math.round((d.count / stats.total) * 100) : 0
                    const barColor = colors ? (colors[d[key]] || 'bg-gray-400') : color
                    return (
                      <div key={d[key]} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-24 truncate capitalize">{d[key]}</span>
                        <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                          <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-5 text-right">{d.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: side panel */}
      {showPanel && (
        <div className="w-96 flex-shrink-0 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          {panelMode === 'detail' && selectedCI && (
            <CIDetail
              ci={selectedCI}
              onClose={closePanel}
              onEdit={() => setPanelMode('edit')}
              onManageRel={() => setPanelMode('rel')}
            />
          )}
          {(panelMode === 'edit' || panelMode === 'new') && (
            <CIForm
              initial={panelMode === 'edit' ? selectedCI : {}}
              onSave={handleSave}
              onCancel={() => panelMode === 'edit' ? setPanelMode('detail') : closePanel()}
            />
          )}
          {panelMode === 'rel' && selectedCI && (
            <RelationshipManager
              ci={selectedCI}
              allItems={items}
              onClose={() => setPanelMode('detail')}
              onRefresh={refreshSelected}
            />
          )}
        </div>
      )}
    </div>
  )
}
