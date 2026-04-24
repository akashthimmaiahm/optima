import { useEffect, useState } from 'react'
import { Plus, Search, Edit, Trash2, RefreshCw, AlertTriangle } from 'lucide-react'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { useAuth } from '../../contexts/AuthContext'

const statusVariant = { active: 'success', expired: 'danger', expiring_soon: 'warning', draft: 'default', terminated: 'danger' }

export default function Contracts() {
  const [contracts, setContracts] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ title: '', vendor_id: '', type: 'SaaS Subscription', start_date: '', end_date: '', value: 0, status: 'active', auto_renew: false, renewal_notice_days: 30, description: '' })
  const { hasRole } = useAuth()
  const canEdit = hasRole('super_admin', 'it_admin', 'it_manager')

  const load = () => {
    setLoading(true)
    Promise.all([api.get('/contracts'), api.get('/vendors')]).then(([c, v]) => { setContracts(c.data.data); setVendors(v.data.data) }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setEditItem(null); setForm({ title: '', vendor_id: '', type: 'SaaS Subscription', start_date: '', end_date: '', value: 0, status: 'active', auto_renew: false, renewal_notice_days: 30, description: '' }); setModalOpen(true) }
  const openEdit = (c) => { setEditItem(c); setForm({ ...c, start_date: c.start_date?.split('T')[0] || '', end_date: c.end_date?.split('T')[0] || '', auto_renew: !!c.auto_renew }); setModalOpen(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editItem) await api.put(`/contracts/${editItem.id}`, form)
      else await api.post('/contracts', form)
      setModalOpen(false); load()
    } catch (err) { alert(err.response?.data?.error || 'Error') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this contract?')) return
    await api.delete(`/contracts/${id}`); load()
  }

  const filtered = contracts.filter(c => {
    if (search && !c.title.toLowerCase().includes(search.toLowerCase()) && !c.vendor_name?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType && c.type !== filterType) return false
    if (filterStatus && c.status !== filterStatus) return false
    return true
  })
  const expiringContracts = filtered.filter(c => c.end_date && new Date(c.end_date) <= new Date(Date.now() + 90*24*60*60*1000) && c.status !== 'expired')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contracts</h1><p className="text-gray-500 dark:text-gray-400 mt-1">{contracts.length} contracts tracked</p></div>
        {canEdit && <button onClick={openAdd} className="btn-primary"><Plus size={18} /> Add Contract</button>}
      </div>
      {expiringContracts.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-700 dark:text-yellow-300"><strong>{expiringContracts.length} contract(s)</strong> expiring within 90 days. Please review and renew.</p>
        </div>
      )}
      <div className="card p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]"><Search size={16} className="absolute left-3 top-2.5 text-gray-400" /><input placeholder="Search contracts..." className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="input w-48" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {['SaaS Subscription', 'Enterprise License', 'Hardware Purchase', 'Maintenance', 'Support', 'Cloud Services', 'Professional Services', 'Other'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="input w-40" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {['active', 'draft', 'expiring_soon', 'expired', 'terminated'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} /></button>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">Contract</th>
                <th className="table-header">Vendor</th>
                <th className="table-header">Type</th>
                <th className="table-header">Value</th>
                <th className="table-header">Start Date</th>
                <th className="table-header">End Date</th>
                <th className="table-header">Auto Renew</th>
                <th className="table-header">Status</th>
                {canEdit && <th className="table-header">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading...</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={9} className="text-center py-12 text-gray-400">No contracts found</td></tr>
              : filtered.map(c => (
                <tr key={c.id} className="table-row">
                  <td className="table-cell"><p className="font-medium text-gray-900 dark:text-white">{c.title}</p></td>
                  <td className="table-cell text-gray-600 dark:text-gray-400">{c.vendor_name || '—'}</td>
                  <td className="table-cell"><Badge variant="info">{c.type}</Badge></td>
                  <td className="table-cell font-medium text-gray-900 dark:text-white">${c.value?.toLocaleString()}</td>
                  <td className="table-cell text-gray-500">{c.start_date ? new Date(c.start_date).toLocaleDateString() : '—'}</td>
                  <td className="table-cell">
                    {c.end_date ? <span className={new Date(c.end_date) <= new Date(Date.now() + 90*24*60*60*1000) ? 'text-yellow-600 font-medium' : 'text-gray-500'}>{new Date(c.end_date).toLocaleDateString()}</span> : '—'}
                  </td>
                  <td className="table-cell"><Badge variant={c.auto_renew ? 'success' : 'default'}>{c.auto_renew ? 'Yes' : 'No'}</Badge></td>
                  <td className="table-cell"><Badge variant={statusVariant[c.status] || 'default'}>{c.status?.replace('_', ' ')}</Badge></td>
                  {canEdit && (
                    <td className="table-cell">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors"><Edit size={15} /></button>
                        <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-red-600 transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Contract' : 'Add Contract'} size="lg">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="label">Contract Title *</label><input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required /></div>
          <div><label className="label">Vendor</label>
            <select className="input" value={form.vendor_id} onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
              <option value="">Select vendor...</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div><label className="label">Contract Type</label>
            <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {['SaaS Subscription', 'Enterprise License', 'Hardware Purchase', 'Maintenance', 'Support', 'Cloud Services', 'Professional Services', 'Other'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Contract Value ($)</label><input type="number" step="0.01" className="input" value={form.value} onChange={e => setForm(f => ({ ...f, value: +e.target.value }))} /></div>
          <div><label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {['active', 'draft', 'expiring_soon', 'expired', 'terminated'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div><label className="label">Start Date</label><input type="date" className="input" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
          <div><label className="label">End Date</label><input type="date" className="input" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></div>
          <div><label className="label">Renewal Notice (days)</label><input type="number" className="input" value={form.renewal_notice_days} onChange={e => setForm(f => ({ ...f, renewal_notice_days: +e.target.value }))} /></div>
          <div className="flex items-center gap-3 mt-6">
            <input type="checkbox" id="auto_renew" checked={!!form.auto_renew} onChange={e => setForm(f => ({ ...f, auto_renew: e.target.checked }))} className="w-4 h-4 text-blue-600 rounded" />
            <label htmlFor="auto_renew" className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto Renew</label>
          </div>
          <div className="col-span-2"><label className="label">Description</label><textarea className="input" rows={2} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="col-span-2 flex gap-3 justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editItem ? 'Update' : 'Add'} Contract</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
