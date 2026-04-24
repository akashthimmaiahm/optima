import { useEffect, useState } from 'react'
import { Plus, Search, Edit, Trash2, RefreshCw, Globe, Mail, Phone, Clock, User, AlertCircle } from 'lucide-react'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { useAuth } from '../../contexts/AuthContext'

const EMPTY_FORM = {
  name: '', type: '', contact_name: '', email: '', phone: '', website: '',
  address: '', notes: '', poc_name: '', poc_phone: '', service_hours: '',
  sla_tier: 'standard', escalation_email: ''
}

const SLA_COLORS = {
  premium: 'text-purple-400 bg-purple-900/20 border-purple-800/50',
  standard: 'text-blue-400 bg-blue-900/20 border-blue-800/50',
  basic: 'text-gray-400 bg-gray-800/40 border-gray-700',
}

export default function Vendors() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSLA, setFilterSLA] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const { hasRole } = useAuth()
  const canEdit = hasRole('super_admin', 'it_admin', 'it_manager', 'asset_manager')

  const load = () => {
    setLoading(true)
    api.get('/vendors').then(r => setVendors(r.data.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setModalOpen(true) }
  const openEdit = (v) => { setEditItem(v); setForm({ ...EMPTY_FORM, ...v }); setModalOpen(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editItem) await api.put(`/vendors/${editItem.id}`, form)
      else await api.post('/vendors', form)
      setModalOpen(false)
      load()
    } catch (err) { alert(err.response?.data?.error || 'Error') }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this vendor?')) return
    await api.delete(`/vendors/${id}`)
    load()
  }

  const filtered = vendors.filter(v => {
    if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !v.contact_name?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType && v.type !== filterType) return false
    if (filterSLA && v.sla_tier !== filterSLA) return false
    return true
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Vendors</h1>
          <p className="text-gray-500 mt-0.5 text-sm">{vendors.length} vendors managed</p>
        </div>
        {canEdit && (
          <button onClick={openAdd} className="btn-primary">
            <Plus size={16} /> Add Vendor
          </button>
        )}
      </div>

      <div className="card p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-500" />
          <input placeholder="Search vendors..." className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {['Software', 'Hardware', 'Cloud', 'Network', 'Services', 'Telecom', 'Other'].map(t => <option key={t}>{t}</option>)}
        </select>
        <select className="input w-36" value={filterSLA} onChange={e => setFilterSLA(e.target.value)}>
          <option value="">All SLA Tiers</option>
          {['basic', 'standard', 'premium'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          <p className="text-gray-500 col-span-3 py-12 text-center">Loading...</p>
        ) : filtered.map(v => (
          <div key={v.id} className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-white text-base">{v.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="info">{v.type || 'Vendor'}</Badge>
                  {v.sla_tier && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${SLA_COLORS[v.sla_tier] || SLA_COLORS.standard}`}>
                      {v.sla_tier} SLA
                    </span>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <button onClick={() => openEdit(v)} className="p-1.5 rounded hover:bg-[#22222e] text-gray-500 hover:text-blue-400 transition-colors">
                    <Edit size={15} />
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="p-1.5 rounded hover:bg-[#22222e] text-gray-500 hover:text-red-400 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 text-sm">
              {/* Primary contact */}
              {v.contact_name && (
                <p className="text-gray-400">Contact: <span className="text-gray-300">{v.contact_name}</span></p>
              )}
              {v.email && (
                <div className="flex items-center gap-2 text-gray-500">
                  <Mail size={13} />
                  <a href={`mailto:${v.email}`} className="hover:text-blue-400 truncate">{v.email}</a>
                </div>
              )}
              {v.phone && (
                <div className="flex items-center gap-2 text-gray-500">
                  <Phone size={13} />
                  <span>{v.phone}</span>
                </div>
              )}
              {v.website && (
                <div className="flex items-center gap-2 text-gray-500">
                  <Globe size={13} />
                  <a href={v.website} target="_blank" rel="noreferrer" className="hover:text-blue-400 truncate">{v.website}</a>
                </div>
              )}

              {/* POC & Service info — new fields */}
              {(v.poc_name || v.poc_phone || v.service_hours || v.escalation_email) && (
                <div className="mt-3 pt-3 border-t border-[#2a2a35] space-y-1.5">
                  {v.poc_name && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <User size={13} className="text-blue-500 flex-shrink-0" />
                      <span className="text-xs">POC: <span className="text-gray-300">{v.poc_name}</span></span>
                    </div>
                  )}
                  {v.poc_phone && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Phone size={13} className="text-blue-500 flex-shrink-0" />
                      <span className="text-xs">POC Phone: <span className="text-gray-300">{v.poc_phone}</span></span>
                    </div>
                  )}
                  {v.service_hours && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Clock size={13} className="text-green-500 flex-shrink-0" />
                      <span className="text-xs">Hours: <span className="text-gray-300">{v.service_hours}</span></span>
                    </div>
                  )}
                  {v.escalation_email && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <AlertCircle size={13} className="text-orange-500 flex-shrink-0" />
                      <a href={`mailto:${v.escalation_email}`} className="text-xs hover:text-orange-400 truncate">
                        Escalation: {v.escalation_email}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Vendor' : 'Add Vendor'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Vendor Name *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.type || ''} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                {['', 'Software', 'Hardware', 'Cloud', 'Network', 'Services', 'Telecom', 'Other'].map(t => (
                  <option key={t} value={t}>{t || 'Select type...'}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">SLA Tier</label>
              <select className="input" value={form.sla_tier || 'standard'} onChange={e => setForm(f => ({ ...f, sla_tier: e.target.value }))}>
                {['basic', 'standard', 'premium'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Primary contact */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Primary Contact</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Contact Name</label>
                <input className="input" value={form.contact_name || ''} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="label">Email</label>
                <input type="email" className="input" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Point of Contact (dedicated support) */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Point of Contact (Support)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">POC Name</label>
                <input className="input" placeholder="Dedicated support contact" value={form.poc_name || ''} onChange={e => setForm(f => ({ ...f, poc_name: e.target.value }))} />
              </div>
              <div>
                <label className="label">POC Phone</label>
                <input className="input" placeholder="Direct line" value={form.poc_phone || ''} onChange={e => setForm(f => ({ ...f, poc_phone: e.target.value }))} />
              </div>
              <div>
                <label className="label">Service Hours</label>
                <input className="input" placeholder="e.g. Mon–Fri 9am–6pm EST" value={form.service_hours || ''} onChange={e => setForm(f => ({ ...f, service_hours: e.target.value }))} />
              </div>
              <div>
                <label className="label">Escalation Email</label>
                <input type="email" className="input" placeholder="escalations@vendor.com" value={form.escalation_email || ''} onChange={e => setForm(f => ({ ...f, escalation_email: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Other */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Website</label>
              <input className="input" value={form.website || ''} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editItem ? 'Update' : 'Add'} Vendor</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
