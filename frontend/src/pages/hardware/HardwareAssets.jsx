import { useEffect, useState } from 'react'
import { Plus, Search, Edit, Trash2, RefreshCw, Monitor, ShieldCheck, ShieldOff, AlertTriangle, ChevronDown, ChevronUp, Cpu, HardDrive, Wifi, Bot, User, ExternalLink } from 'lucide-react'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { useAuth } from '../../contexts/AuthContext'

const statusVariant = { active: 'success', inactive: 'default', in_repair: 'warning', retired: 'danger', disposed: 'danger' }
const conditionVariant = { excellent: 'success', good: 'success', fair: 'warning', poor: 'danger' }

const initialForm = { asset_tag: '', name: '', type: 'Laptop', manufacturer: '', model: '', serial_number: '', status: 'active', condition: 'good', location: '', assigned_to: '', department: '', purchase_date: '', purchase_cost: 0, warranty_expiry: '', warranty_status: 'active', warranty_provider: '', warranty_type: 'standard', ip_address: '', mac_address: '', os: '', processor: '', ram: '', storage: '', notes: '', is_eol: 0, eol_date: '', eol_replacement: '', eol_notes: '' }

const warrantyStatusColor = {
  active: 'text-green-400',
  expiring: 'text-yellow-400',
  expired: 'text-red-400',
}

const hwTypes = ['Laptop', 'Desktop', 'Server', 'Mobile', 'Monitor', 'Printer', 'Network Switch', 'Firewall', 'Router', 'Storage', 'Tablet', 'Peripheral', 'Other']

function warrantyState(a) {
  if (!a.warranty_expiry) return 'none'
  const exp = new Date(a.warranty_expiry)
  const now = new Date()
  const in90 = new Date(Date.now() + 90 * 86400000)
  if (exp < now)  return 'out'
  if (exp < in90) return 'expiring'
  return 'in'
}

function HardwareRow({ asset: a, canEdit, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const isAgent = a.asset_tag?.startsWith('AGT-')

  return (
    <>
      <tr className="table-row">
        <td className="table-cell">
          <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </td>
        <td className="table-cell">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{a.name}</p>
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] text-gray-400 font-mono">{a.asset_tag}</p>
              {a.serial_number && <p className="text-[10px] text-gray-500">SN: {a.serial_number}</p>}
            </div>
          </div>
        </td>
        <td className="table-cell">
          <Badge variant="info">{a.type}</Badge>
          <p className="text-[10px] text-gray-400 mt-0.5">{a.manufacturer} {a.model}</p>
        </td>
        <td className="table-cell">
          {a.os && <p className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[180px]">{a.os}</p>}
          <div className="flex items-center gap-2 mt-0.5">
            {a.processor && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Cpu size={9} />{a.processor.split(' ').slice(0, 3).join(' ')}</span>}
            {a.ram && <span className="text-[10px] text-gray-400">{a.ram}</span>}
          </div>
        </td>
        <td className="table-cell">
          {a.ip_address ? (
            <div>
              <p className="text-xs text-gray-700 dark:text-gray-300 font-mono">{a.ip_address}</p>
              {a.mac_address && <p className="text-[10px] text-gray-500 font-mono">{a.mac_address}</p>}
            </div>
          ) : <span className="text-gray-500 text-xs">—</span>}
        </td>
        <td className="table-cell">
          <Badge variant={statusVariant[a.status] || 'default'}>{a.status?.replace('_', ' ')}</Badge>
          <Badge variant={conditionVariant[a.condition] || 'default'} className="ml-1">{a.condition}</Badge>
        </td>
        <td className="table-cell">
          <div className="space-y-1">
            {a.is_eol ? (
              <div className="flex items-center gap-1">
                <AlertTriangle size={12} className="text-red-400" />
                <span className="text-[10px] font-semibold text-red-400">EOL</span>
              </div>
            ) : null}
            {a.warranty_expiry ? (() => {
              const ws = warrantyState(a)
              const colors = { in: 'text-green-400', expiring: 'text-yellow-400', out: 'text-red-400' }
              const Icon = ws === 'in' ? ShieldCheck : ShieldOff
              return (
                <div className="flex items-center gap-1">
                  <Icon size={12} className={colors[ws]} />
                  <span className={`text-[10px] font-medium ${colors[ws]}`}>
                    {ws === 'in' ? 'Active' : ws === 'expiring' ? 'Expiring' : 'Expired'}
                  </span>
                </div>
              )
            })() : <span className="text-gray-600 text-[10px]">N/A</span>}
          </div>
        </td>
        <td className="table-cell">
          {isAgent ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-purple-500 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full">
              <Bot size={10} /> Agent
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              <User size={10} /> Manual
            </span>
          )}
        </td>
        <td className="table-cell">
          <div className="flex gap-1">
            <a
              href="https://app.sclera.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 hover:text-green-500 transition-colors"
              title="Monitor"
            >
              <Monitor size={14} />
            </a>
            {canEdit && <>
              <button onClick={() => onEdit(a)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 hover:text-blue-400 transition-colors"><Edit size={14} /></button>
              <button onClick={() => onDelete(a.id)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
            </>}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-800/30">
          <td colSpan={9} className="px-6 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-gray-400 font-semibold uppercase text-[10px] mb-1">Hardware</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Manufacturer:</span> {a.manufacturer || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Model:</span> {a.model || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Serial:</span> {a.serial_number || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Type:</span> {a.type}</p>
              </div>
              <div>
                <p className="text-gray-400 font-semibold uppercase text-[10px] mb-1">System</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">OS:</span> {a.os || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Processor:</span> {a.processor || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">RAM:</span> {a.ram || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Storage:</span> {a.storage || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 font-semibold uppercase text-[10px] mb-1">Network</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">IP:</span> {a.ip_address || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">MAC:</span> {a.mac_address || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 font-semibold uppercase text-[10px] mb-1">Assignment</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Assigned to:</span> {a.assigned_to || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Department:</span> {a.department || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Location:</span> {a.location || '—'}</p>
                {a.notes && <p className="text-gray-500 mt-1">{a.notes}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function HardwareAssets() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [conditionFilter, setConditionFilter] = useState('')
  const [warrantyFilter, setWarrantyFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(initialForm)
  const { hasRole } = useAuth()
  const canEdit = hasRole('super_admin', 'it_admin', 'it_manager', 'asset_manager')

  const load = () => {
    setLoading(true)
    api.get('/hardware', { params: { search, type: typeFilter, status: statusFilter, warranty: warrantyFilter } }).then(r => {
      let data = r.data.data
      if (conditionFilter) data = data.filter(a => a.condition === conditionFilter)
      setAssets(data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [search, typeFilter, statusFilter, conditionFilter, warrantyFilter])

  const openAdd = () => { setEditItem(null); setForm(initialForm); setModalOpen(true) }
  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      ...initialForm,
      ...item,
      purchase_date: item.purchase_date?.split('T')[0] || '',
      warranty_expiry: item.warranty_expiry?.split('T')[0] || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editItem) await api.put(`/hardware/${editItem.id}`, form)
      else await api.post('/hardware', form)
      setModalOpen(false)
      load()
    } catch (err) { alert(err.response?.data?.error || 'Error saving') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this hardware asset?')) return
    await api.delete(`/hardware/${id}`)
    load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hardware Assets</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{assets.length} hardware assets tracked</p>
        </div>
        {canEdit && <button onClick={openAdd} className="btn-primary"><Plus size={18} /> Add Hardware</button>}
      </div>

      <div className="card p-4 flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input placeholder="Search assets, tags, serial numbers..." className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {hwTypes.map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="input w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {['active', 'inactive', 'in_repair', 'retired', 'disposed'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select className="input w-36" value={conditionFilter} onChange={e => setConditionFilter(e.target.value)}>
          <option value="">All Conditions</option>
          {['excellent', 'good', 'fair', 'poor'].map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="input w-40" value={warrantyFilter} onChange={e => setWarrantyFilter(e.target.value)}>
          <option value="">All Warranty</option>
          <option value="in">In Warranty</option>
          <option value="out">Out of Warranty</option>
          <option value="eol">End of Life</option>
        </select>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} /></button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Assets', value: assets.length, color: 'text-blue-600' },
          { label: 'Active', value: assets.filter(a => a.status === 'active').length, color: 'text-green-600' },
          { label: 'Agent Discovered', value: assets.filter(a => a.asset_tag?.startsWith('AGT-')).length, color: 'text-purple-600', icon: Bot },
          { label: 'In Warranty', value: assets.filter(a => warrantyState(a) === 'in').length, color: 'text-emerald-600' },
          { label: 'End of Life', value: assets.filter(a => a.is_eol).length, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="card p-3">
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">{s.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header w-8"></th>
                <th className="table-header">Asset</th>
                <th className="table-header">Type</th>
                <th className="table-header">OS / Specs</th>
                <th className="table-header">Network</th>
                <th className="table-header">Status</th>
                <th className="table-header">Warranty</th>
                <th className="table-header">Source</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : assets.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">No assets found</td></tr>
              ) : assets.map(a => (
                <HardwareRow key={a.id} asset={a} canEdit={canEdit} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Hardware Asset' : 'Add Hardware Asset'} size="xl">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div><label className="label">Asset Tag *</label><input className="input" value={form.asset_tag} onChange={e => setForm(f => ({ ...f, asset_tag: e.target.value }))} required /></div>
          <div><label className="label">Asset Name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><label className="label">Type *</label>
            <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {hwTypes.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Manufacturer</label><input className="input" value={form.manufacturer || ''} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} /></div>
          <div><label className="label">Model</label><input className="input" value={form.model || ''} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} /></div>
          <div><label className="label">Serial Number</label><input className="input" value={form.serial_number || ''} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} /></div>
          <div><label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {['active', 'inactive', 'in_repair', 'retired', 'disposed'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="label">Condition</label>
            <select className="input" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
              {['excellent', 'good', 'fair', 'poor'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="label">Location</label><input className="input" value={form.location || ''} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
          <div><label className="label">Assigned To</label><input className="input" value={form.assigned_to || ''} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} /></div>
          <div><label className="label">Department</label><input className="input" value={form.department || ''} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} /></div>
          <div><label className="label">Purchase Cost ($)</label><input type="number" step="0.01" className="input" value={form.purchase_cost} onChange={e => setForm(f => ({ ...f, purchase_cost: +e.target.value }))} /></div>
          <div><label className="label">Purchase Date</label><input type="date" className="input" value={form.purchase_date || ''} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></div>
          <div><label className="label">Warranty Expiry</label><input type="date" className="input" value={form.warranty_expiry || ''} onChange={e => setForm(f => ({ ...f, warranty_expiry: e.target.value }))} /></div>
          <div><label className="label">Warranty Status</label>
            <select className="input" value={form.warranty_status || 'active'} onChange={e => setForm(f => ({ ...f, warranty_status: e.target.value }))}>
              {['active', 'expiring', 'expired'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="label">Warranty Provider</label><input className="input" placeholder="e.g. Dell ProSupport" value={form.warranty_provider || ''} onChange={e => setForm(f => ({ ...f, warranty_provider: e.target.value }))} /></div>
          <div><label className="label">Warranty Type</label>
            <select className="input" value={form.warranty_type || 'standard'} onChange={e => setForm(f => ({ ...f, warranty_type: e.target.value }))}>
              {['standard', 'extended', 'onsite', 'nbdos', 'accidental'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Operating System</label><input className="input" value={form.os || ''} onChange={e => setForm(f => ({ ...f, os: e.target.value }))} /></div>
          <div><label className="label">Processor</label><input className="input" value={form.processor || ''} onChange={e => setForm(f => ({ ...f, processor: e.target.value }))} /></div>
          <div><label className="label">RAM</label><input className="input" value={form.ram || ''} onChange={e => setForm(f => ({ ...f, ram: e.target.value }))} /></div>
          <div><label className="label">Storage</label><input className="input" value={form.storage || ''} onChange={e => setForm(f => ({ ...f, storage: e.target.value }))} /></div>
          <div><label className="label">IP Address</label><input className="input" value={form.ip_address || ''} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))} /></div>
          <div><label className="label">MAC Address</label><input className="input" value={form.mac_address || ''} onChange={e => setForm(f => ({ ...f, mac_address: e.target.value }))} /></div>
          <div className="col-span-2"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="col-span-2 flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editItem ? 'Update' : 'Add'} Asset</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
