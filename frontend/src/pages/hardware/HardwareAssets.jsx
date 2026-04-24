import { useEffect, useState } from 'react'
import { Plus, Search, Edit, Trash2, RefreshCw, Monitor, ShieldCheck, ShieldOff, AlertTriangle } from 'lucide-react'
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

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">Asset</th>
                <th className="table-header">Type</th>
                <th className="table-header">Manufacturer</th>
                <th className="table-header">Assigned To</th>
                <th className="table-header">Location</th>
                <th className="table-header">Status</th>
                <th className="table-header">Condition</th>
                <th className="table-header">Warranty</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : assets.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">No assets found</td></tr>
              ) : assets.map(a => (
                <tr key={a.id} className="table-row">
                  <td className="table-cell">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{a.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{a.asset_tag}</p>
                    </div>
                  </td>
                  <td className="table-cell"><Badge variant="info">{a.type}</Badge></td>
                  <td className="table-cell">
                    <p className="text-gray-700 dark:text-gray-300">{a.manufacturer}</p>
                    <p className="text-xs text-gray-400">{a.model}</p>
                  </td>
                  <td className="table-cell">{a.assigned_to || <span className="text-gray-400">Unassigned</span>}</td>
                  <td className="table-cell text-gray-500">{a.location || '—'}</td>
                  <td className="table-cell"><Badge variant={statusVariant[a.status] || 'default'}>{a.status?.replace('_', ' ')}</Badge></td>
                  <td className="table-cell"><Badge variant={conditionVariant[a.condition] || 'default'}>{a.condition}</Badge></td>
                  <td className="table-cell">
                    <div className="space-y-1">
                      {a.is_eol ? (
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
                          <span className="text-xs font-semibold text-red-400">End of Life</span>
                        </div>
                      ) : null}
                      {a.warranty_expiry ? (() => {
                        const ws = warrantyState(a)
                        const colors = { in: 'text-green-400', expiring: 'text-yellow-400', out: 'text-red-400' }
                        const icons  = { in: ShieldCheck, expiring: ShieldOff, out: ShieldOff }
                        const Icon = icons[ws] || ShieldOff
                        return (
                          <div className="flex items-center gap-1.5">
                            <Icon size={13} className={colors[ws] || 'text-gray-400'} />
                            <div>
                              <span className={`text-xs font-medium ${colors[ws] || 'text-gray-400'}`}>
                                {ws === 'in' ? 'In Warranty' : ws === 'expiring' ? 'Expiring Soon' : 'Out of Warranty'}
                              </span>
                              <p className="text-xs text-gray-500">{new Date(a.warranty_expiry).toLocaleDateString()}</p>
                            </div>
                          </div>
                        )
                      })() : <span className="text-gray-600 text-xs">No warranty</span>}
                      {a.eol_replacement && (
                        <p className="text-xs text-blue-400 truncate max-w-[140px]">→ {a.eol_replacement}</p>
                      )}
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      <a
                        href="https://app.sclera.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Monitor in Sclera"
                        className="p-1.5 rounded hover:bg-blue-900/30 text-gray-500 hover:text-blue-400 transition-colors"
                      >
                        <Monitor size={15} />
                      </a>
                      {canEdit && <>
                        <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-gray-700/50 text-gray-500 hover:text-blue-400 transition-colors"><Edit size={15} /></button>
                        <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded hover:bg-gray-700/50 text-gray-500 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                      </>}
                    </div>
                  </td>
                </tr>
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
