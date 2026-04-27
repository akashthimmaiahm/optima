import { useEffect, useState } from 'react'
import { Plus, Edit, Archive, RefreshCw, Building2, HardDrive, Monitor, Users, Smartphone, FileText, DollarSign, AlertTriangle, CheckCircle, XCircle, Globe } from 'lucide-react'
import api from '../../api/axios'
import Modal from '../../components/common/Modal'
import Badge from '../../components/common/Badge'
import { useAuth } from '../../contexts/AuthContext'

const EMPTY_FORM = {
  name: '', slug: '', domain: '', plan: 'standard', admin_email: '',
  max_assets: 10000, timezone: 'UTC', currency: 'USD', notes: ''
}

const PLANS = ['standard', 'professional', 'enterprise']
const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney']
const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'NPR', symbol: 'रू', name: 'Nepalese Rupee' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
]

const planColor = { enterprise: 'purple', professional: 'info', standard: 'default' }
const statusColor = { active: 'success', inactive: 'warning', archived: 'danger' }

function StatCard({ icon: Icon, label, value, color = 'blue' }) {
  const colors = { blue: 'bg-blue-900/20 text-blue-400', green: 'bg-green-900/20 text-green-400', purple: 'bg-purple-900/20 text-purple-400', orange: 'bg-orange-900/20 text-orange-400' }
  return (
    <div className="flex items-center gap-3 p-3 bg-[#1a1a1f] rounded-lg border border-[#2a2a35]">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-lg font-bold text-white leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default function Properties() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [selectedProp, setSelectedProp] = useState(null)
  const [propStats, setPropStats] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const { hasRole } = useAuth()

  const load = () => {
    setLoading(true)
    api.get('/properties').then(r => setProperties(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setModalOpen(true) }
  const openEdit = (p) => {
    setEditItem(p)
    setForm({ name: p.name, slug: p.slug, domain: p.domain || '', plan: p.plan || 'standard', admin_email: p.admin_email || '', max_assets: p.max_assets || 10000, timezone: p.timezone || 'UTC', currency: p.currency || 'USD', notes: p.notes || '' })
    setModalOpen(true)
  }

  const openDetail = async (p) => {
    setSelectedProp(p)
    setPropStats(null)
    setDetailOpen(true)
    try {
      const r = await api.get(`/properties/${p.id}/stats`)
      setPropStats(r.data)
    } catch {}
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editItem) await api.put(`/properties/${editItem.id}`, form)
      else await api.post('/properties', form)
      setModalOpen(false)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Error saving property')
    } finally { setSaving(false) }
  }

  const handleArchive = async (id) => {
    if (!confirm('Archive this property? Its data will be preserved but the property will be inactive.')) return
    await api.delete(`/properties/${id}`)
    load()
  }

  const autoSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  if (!hasRole('super_admin')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle size={40} className="text-yellow-500 mx-auto mb-3" />
          <p className="text-gray-400">Super Admin access required</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Properties</h1>
          <p className="text-gray-500 mt-1 text-sm">{properties.length} properties — multi-tenant management</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary"><RefreshCw size={16} /></button>
          <button onClick={openAdd} className="btn-primary"><Plus size={16} /> New Property</button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Building2} label="Total Properties" value={properties.length} color="blue" />
        <StatCard icon={CheckCircle} label="Active" value={properties.filter(p => p.status === 'active').length} color="green" />
        <StatCard icon={HardDrive} label="Total Assets" value={properties.reduce((a, p) => a + (p.asset_count || 0), 0).toLocaleString()} color="purple" />
        <StatCard icon={Users} label="Total Users" value={properties.reduce((a, p) => a + (p.user_count || 0), 0)} color="orange" />
      </div>

      {/* Property cards */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading properties...</div>
      ) : properties.length === 0 ? (
        <div className="text-center py-16 text-gray-500">No properties yet. Create your first one.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {properties.map(p => (
            <div key={p.id} className="card p-5 hover:border-blue-700/50 transition-colors cursor-pointer" onClick={() => openDetail(p)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Building2 size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{p.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{p.slug}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-[#22222e] text-gray-500 hover:text-blue-400 transition-colors">
                    <Edit size={14} />
                  </button>
                  {p.id !== 1 && (
                    <button onClick={() => handleArchive(p.id)} className="p-1.5 rounded hover:bg-[#22222e] text-gray-500 hover:text-red-400 transition-colors">
                      <Archive size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Badge variant={statusColor[p.status] || 'default'}>{p.status}</Badge>
                <Badge variant={planColor[p.plan] || 'default'}>{p.plan}</Badge>
                {p.currency && <Badge variant="info">{p.currency}</Badge>}
              </div>

              {p.domain && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
                  <Globe size={12} />
                  <span>{p.domain}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#2a2a35]">
                <div className="text-center">
                  <p className="text-base font-bold text-white">{p.hardware_count || 0}</p>
                  <p className="text-xs text-gray-600">Hardware</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-white">{p.software_count || 0}</p>
                  <p className="text-xs text-gray-600">Software</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-white">{p.user_count || 0}</p>
                  <p className="text-xs text-gray-600">Users</p>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-[#2a2a35] flex items-center justify-between">
                <span className="text-xs text-gray-600">Max assets: {(p.max_assets || 10000).toLocaleString()}</span>
                <div className="h-1.5 flex-1 mx-3 bg-[#2a2a35] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${Math.min(((p.asset_count || 0) / (p.max_assets || 10000)) * 100, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{Math.round(((p.asset_count || 0) / (p.max_assets || 10000)) * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? `Edit: ${editItem.name}` : 'New Property'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Property Name *</label>
              <input className="input" value={form.name} required onChange={e => {
                const name = e.target.value
                setForm(f => ({ ...f, name, slug: editItem ? f.slug : autoSlug(name) }))
              }} />
            </div>
            <div>
              <label className="label">Slug * <span className="text-gray-600 font-normal">(URL-safe identifier)</span></label>
              <input className="input font-mono text-sm" value={form.slug} required placeholder="my-property"
                onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
            </div>
            <div>
              <label className="label">Domain / Subdomain</label>
              <input className="input" value={form.domain} placeholder="prop1.optima.io"
                onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} />
            </div>
            <div>
              <label className="label">Admin Email</label>
              <input type="email" className="input" value={form.admin_email} placeholder="admin@property.com"
                onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Plan</label>
              <select className="input" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Max Assets</label>
              <input type="number" className="input" value={form.max_assets} min={100} max={1000000}
                onChange={e => setForm(f => ({ ...f, max_assets: +e.target.value }))} />
            </div>
            <div>
              <label className="label">Timezone</label>
              <select className="input" value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
                {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : editItem ? 'Update Property' : 'Create Property'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Detail / Stats Modal */}
      <Modal isOpen={detailOpen} onClose={() => setDetailOpen(false)} title={selectedProp?.name || 'Property Details'} size="lg">
        {!propStats ? (
          <div className="py-12 text-center text-gray-500">Loading stats...</div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={statusColor[propStats.property.status] || 'default'}>{propStats.property.status}</Badge>
              <Badge variant={planColor[propStats.property.plan] || 'default'}>{propStats.property.plan} plan</Badge>
              {propStats.property.domain && (
                <span className="text-xs text-gray-400 flex items-center gap-1"><Globe size={12} />{propStats.property.domain}</span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard icon={HardDrive} label="Hardware Assets" value={propStats.hardware_count} color="blue" />
              <StatCard icon={Monitor} label="Software Assets" value={propStats.software_count} color="purple" />
              <StatCard icon={Users} label="Users" value={propStats.user_count} color="green" />
              <StatCard icon={Smartphone} label="MDM Devices" value={propStats.mdm_count} color="orange" />
              <StatCard icon={FileText} label="Active Contracts" value={propStats.contracts_active} color="blue" />
              <StatCard icon={Building2} label="Vendors" value={propStats.vendor_count} color="purple" />
            </div>

            <div className="p-4 bg-[#1a1a1f] rounded-lg border border-[#2a2a35] space-y-2">
              <p className="text-sm font-medium text-gray-300 mb-3">License Summary</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Total licenses</span>
                <span className="text-white font-medium">{propStats.licenses_total.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Used licenses</span>
                <span className="text-white font-medium">{propStats.licenses_used.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Utilization</span>
                <span className={`font-medium ${propStats.licenses_total > 0 && (propStats.licenses_used / propStats.licenses_total) > 0.9 ? 'text-red-400' : 'text-green-400'}`}>
                  {propStats.licenses_total > 0 ? Math.round((propStats.licenses_used / propStats.licenses_total) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Wasted spend</span>
                <span className="text-orange-400 font-medium">${propStats.wasted_spend_mo.toLocaleString()}/mo</span>
              </div>
            </div>

            {propStats.property.notes && (
              <div className="p-3 bg-[#1a1a1f] rounded-lg border border-[#2a2a35]">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-300">{propStats.property.notes}</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => { setDetailOpen(false); openEdit(selectedProp) }} className="btn-secondary">
                <Edit size={14} /> Edit Property
              </button>
              <button onClick={() => setDetailOpen(false)} className="btn-primary">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
