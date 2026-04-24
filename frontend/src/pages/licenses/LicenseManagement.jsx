import { useEffect, useState } from 'react'
import { Plus, Search, RefreshCw, AlertTriangle } from 'lucide-react'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { useAuth } from '../../contexts/AuthContext'

export default function LicenseManagement() {
  const [licenses, setLicenses] = useState([])
  const [software, setSoftware] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ software_id: '', license_key: '', license_type: 'subscription', seats: 1, purchase_date: '', expiry_date: '', cost: 0, vendor: '', order_number: '', notes: '' })
  const { hasRole } = useAuth()
  const canEdit = hasRole('super_admin', 'it_admin', 'it_manager', 'asset_manager')

  const load = () => {
    setLoading(true)
    Promise.all([api.get('/licenses'), api.get('/software')]).then(([l, s]) => {
      setLicenses(l.data.data)
      setSoftware(s.data.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try { await api.post('/licenses', form); setModalOpen(false); load() } catch (err) { alert(err.response?.data?.error || 'Error') }
  }

  const expiring = licenses.filter(l => l.expiry_date && new Date(l.expiry_date) <= new Date(Date.now() + 90*24*60*60*1000))
  const filtered = licenses.filter(l => {
    if (search && !l.software_name?.toLowerCase().includes(search.toLowerCase()) && !l.vendor?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType && l.license_type !== filterType) return false
    if (filterStatus && l.status !== filterStatus) return false
    return true
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">License Management</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{licenses.length} licenses managed</p>
        </div>
        {canEdit && <button onClick={() => setModalOpen(true)} className="btn-primary"><Plus size={18} /> Add License</button>}
      </div>

      {expiring.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-yellow-800 dark:text-yellow-300">License Expiration Alert</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-400">{expiring.length} license(s) expiring within 90 days. Review and renew as needed.</p>
          </div>
        </div>
      )}

      <div className="card p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input placeholder="Search licenses..." className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All License Types</option>
          {['subscription', 'perpetual', 'trial', 'volume', 'oem'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="input w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {['active', 'expired', 'inactive'].map(s => <option key={s}>{s}</option>)}
        </select>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} /></button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">Software</th>
                <th className="table-header">License Type</th>
                <th className="table-header">Seats</th>
                <th className="table-header">Cost</th>
                <th className="table-header">Purchase Date</th>
                <th className="table-header">Expiry Date</th>
                <th className="table-header">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">No licenses found</td></tr>
              : filtered.map(l => {
                const isExpiring = l.expiry_date && new Date(l.expiry_date) <= new Date(Date.now() + 90*24*60*60*1000)
                return (
                  <tr key={l.id} className="table-row">
                    <td className="table-cell">
                      <p className="font-medium text-gray-900 dark:text-white">{l.software_name || 'N/A'}</p>
                      <p className="text-xs text-gray-400">{l.vendor}</p>
                    </td>
                    <td className="table-cell"><Badge variant="info">{l.license_type}</Badge></td>
                    <td className="table-cell">{l.used_seats} / {l.seats}</td>
                    <td className="table-cell">${l.cost?.toFixed(2) || '0.00'}</td>
                    <td className="table-cell text-gray-500">{l.purchase_date ? new Date(l.purchase_date).toLocaleDateString() : '—'}</td>
                    <td className="table-cell">
                      {l.expiry_date ? <span className={isExpiring ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-gray-500'}>{new Date(l.expiry_date).toLocaleDateString()}</span> : '—'}
                    </td>
                    <td className="table-cell"><Badge variant={l.status === 'active' ? 'success' : 'danger'}>{l.status}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add License" size="lg">
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Software</label>
            <select className="input" value={form.software_id} onChange={e => setForm(f => ({ ...f, software_id: e.target.value }))}>
              <option value="">Select software...</option>
              {software.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="label">License Key</label><input className="input" value={form.license_key} onChange={e => setForm(f => ({ ...f, license_key: e.target.value }))} /></div>
          <div><label className="label">License Type</label>
            <select className="input" value={form.license_type} onChange={e => setForm(f => ({ ...f, license_type: e.target.value }))}>
              {['subscription', 'perpetual', 'trial', 'volume', 'oem'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="label">Seats</label><input type="number" className="input" value={form.seats} onChange={e => setForm(f => ({ ...f, seats: +e.target.value }))} /></div>
          <div><label className="label">Cost ($)</label><input type="number" step="0.01" className="input" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: +e.target.value }))} /></div>
          <div><label className="label">Purchase Date</label><input type="date" className="input" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></div>
          <div><label className="label">Expiry Date</label><input type="date" className="input" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} /></div>
          <div><label className="label">Vendor</label><input className="input" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} /></div>
          <div><label className="label">Order Number</label><input className="input" value={form.order_number} onChange={e => setForm(f => ({ ...f, order_number: e.target.value }))} /></div>
          <div className="col-span-2"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="col-span-2 flex gap-3 justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Add License</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
