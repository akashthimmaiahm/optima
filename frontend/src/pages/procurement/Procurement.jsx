import { useEffect, useState, useCallback } from 'react'
import {
  ShoppingCart, Plus, Search, RefreshCw, CheckCircle, XCircle,
  FileText, Package, Trash2, Edit3, Send, Filter, DollarSign,
  Clock, AlertCircle, Cpu, AlertTriangle, ExternalLink, Loader2,
  User, Calendar, Building2
} from 'lucide-react'
import api from '../../api/axios'
import { useAuth } from '../../contexts/AuthContext'

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_LABELS = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  po_issued: 'PO Issued',
  received: 'Received',
  cancelled: 'Cancelled',
}

const STATUS_CLASSES = {
  draft:            'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  pending_approval: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  approved:         'bg-green-500/20 text-green-400 border border-green-500/30',
  rejected:         'bg-red-500/20 text-red-400 border border-red-500/30',
  po_issued:        'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  received:         'bg-teal-500/20 text-teal-400 border border-teal-500/30',
  cancelled:        'bg-gray-500/20 text-gray-400 border border-gray-500/30',
}

const PRIORITY_CLASSES = {
  low:      'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  medium:   'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  high:     'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
}

const REQUEST_TYPES = ['HAM', 'SAM', 'Service', 'Other']
const PRIORITIES    = ['low', 'medium', 'high', 'critical']
const STATUSES      = Object.keys(STATUS_LABELS)
const UNITS         = ['units', 'licenses', 'seats', 'months', 'years', 'packs', 'devices']

const EMPTY_FORM = {
  title: '', request_type: 'HAM', category: '', department: '',
  vendor_id: '', vendor_name: '', quantity: 1, unit: 'units', estimated_cost: '',
  priority: 'medium', justification: '', description: '',
  manufacturer: '', model: '',
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[status] || STATUS_CLASSES.draft}`}>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function PriorityBadge({ priority }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORITY_CLASSES[priority] || PRIORITY_CLASSES.medium}`}>
      {priority}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

export default function Procurement() {
  const { user, hasRole } = useAuth()
  const canApprove = hasRole('super_admin', 'it_admin', 'it_manager')
  const canManage  = hasRole('super_admin', 'it_admin', 'it_manager', 'asset_manager')

  const [requests, setRequests]     = useState([])
  const [vendors, setVendors]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType]     = useState('')

  const [modalOpen, setModalOpen]   = useState(false)
  const [editItem, setEditItem]     = useState(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)

  // EOL check state
  const [eolResult, setEolResult]   = useState(null)
  const [eolChecking, setEolChecking] = useState(false)

  const checkEOL = async () => {
    const { manufacturer, model, title, vendor_name } = form
    if (!manufacturer && !model && !title) return
    setEolChecking(true)
    setEolResult(null)
    try {
      const r = await api.post('/hardware/eol-check', {
        manufacturer: manufacturer || vendor_name,
        model,
        name: model || title,
      })
      setEolResult(r.data)
    } catch {
      setEolResult({ confidence: 'none', notes: 'Could not reach AI service.' })
    }
    setEolChecking(false)
  }

  // Detail / action modal
  const [detailItem, setDetailItem] = useState(null)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [approvedCost, setApprovedCost]   = useState('')
  const [receivedNotes, setReceivedNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (filterStatus) params.status = filterStatus
    if (filterType)   params.type   = filterType
    if (search)       params.search = search
    api.get('/procurement', { params })
      .then(r => setRequests(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [filterStatus, filterType, search])

  useEffect(() => {
    load()
    api.get('/vendors').then(r => setVendors(r.data.data || [])).catch(() => {})
  }, [load])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = {
    total:            requests.length,
    pending_approval: requests.filter(r => r.status === 'pending_approval').length,
    approved:         requests.filter(r => r.status === 'approved').length,
    po_issued:        requests.filter(r => r.status === 'po_issued').length,
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openNew = () => {
    setEditItem(null)
    setForm(EMPTY_FORM)
    setEolResult(null)
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      title:          item.title || '',
      request_type:   item.request_type || 'HAM',
      category:       item.category || '',
      department:     item.department || '',
      vendor_id:      item.vendor_id || '',
      vendor_name:    item.vendor_name || '',
      quantity:       item.quantity ?? 1,
      unit:           item.unit || 'units',
      estimated_cost: item.estimated_cost ?? '',
      priority:       item.priority || 'medium',
      justification:  item.justification || '',
      description:    item.description || '',
      manufacturer:   item.manufacturer || '',
      model:          item.model || '',
    })
    setEolResult(null)
    setModalOpen(true)
  }

  const openDetail = (item) => {
    setDetailItem(item)
    setApprovalNotes('')
    setApprovedCost(item.estimated_cost ?? '')
    setReceivedNotes(item.received_notes || '')
  }

  const closeDetail = () => setDetailItem(null)

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleVendorSelect = (vendorId) => {
    if (!vendorId) {
      setField('vendor_id', '')
      setField('vendor_name', '')
      return
    }
    if (vendorId === '__other__') {
      setField('vendor_id', '')
      setField('vendor_name', '')
      return
    }
    const v = vendors.find(v => String(v.id) === String(vendorId))
    if (v) {
      setField('vendor_id', v.id)
      setField('vendor_name', v.name)
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editItem) {
        await api.put(`/procurement/${editItem.id}`, form)
      } else {
        await api.post('/procurement', form)
      }
      setModalOpen(false)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save request')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    if (!confirm(`Delete ${item.pr_number}?`)) return
    try {
      await api.delete(`/procurement/${item.id}`)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete')
    }
  }

  // ── Workflow actions ──────────────────────────────────────────────────────
  const doAction = async (url, payload = {}) => {
    setActionLoading(true)
    try {
      const r = await api.post(url, payload)
      setDetailItem(r.data.data)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSubmitPR  = (item) => doAction(`/procurement/${item.id}/submit`)
  const handleApprovePR = (item) => doAction(`/procurement/${item.id}/approve`, { approval_notes: approvalNotes, approved_cost: approvedCost })
  const handleRejectPR  = (item) => doAction(`/procurement/${item.id}/reject`,  { approval_notes: approvalNotes })
  const handleIssuePO   = (item) => doAction(`/procurement/${item.id}/issue-po`)
  const handleReceive   = (item) => doAction(`/procurement/${item.id}/receive`,  { received_notes: receivedNotes })

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShoppingCart size={26} className="text-blue-500" />
            Procurement Management
          </h1>
          <p className="text-gray-500 mt-1 text-sm">{requests.length} total requests</p>
        </div>
        {canManage && (
          <button onClick={openNew} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> New Request
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={ShoppingCart} label="Total Requests"    value={stats.total}            color="bg-blue-600" />
        <StatCard icon={Clock}        label="Pending Approval"  value={stats.pending_approval} color="bg-yellow-600" />
        <StatCard icon={CheckCircle}  label="Approved"          value={stats.approved}         color="bg-green-600" />
        <StatCard icon={FileText}     label="PO Issued"         value={stats.po_issued}        color="bg-indigo-600" />
      </div>

      {/* Filter bar */}
      <div className="card p-4 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            placeholder="Search PR number, title, requester..."
            className="input pl-9 w-full"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-gray-400" />
          <select className="input w-44" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <select className="input w-36" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={load} className="btn-secondary flex items-center gap-2" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-[#2a2a35]">
                {['PR Number','Title','Type / Category','Requester','Vendor','Est. Cost','Status','Priority','Date','Actions'].map(h => (
                  <th key={h} className="table-header whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-16 text-gray-500">Loading...</td></tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16">
                    <ShoppingCart size={36} className="mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-500">No procurement requests found</p>
                  </td>
                </tr>
              ) : requests.map(item => (
                <tr
                  key={item.id}
                  className="table-row cursor-pointer"
                  onClick={() => openDetail(item)}
                >
                  <td className="table-cell">
                    <span className="font-mono text-blue-500 text-xs font-semibold">{item.pr_number}</span>
                  </td>
                  <td className="table-cell">
                    <p className="font-medium text-gray-900 dark:text-white max-w-[180px] truncate">{item.title}</p>
                  </td>
                  <td className="table-cell">
                    <p className="text-gray-700 dark:text-gray-300">{item.request_type}</p>
                    {item.category && <p className="text-gray-500 text-xs">{item.category}</p>}
                  </td>
                  <td className="table-cell">
                    <p className="text-gray-700 dark:text-gray-300">{item.requester_name || '—'}</p>
                    {item.department && <p className="text-gray-500 text-xs">{item.department}</p>}
                  </td>
                  <td className="table-cell text-gray-500">{item.vendor_name || '—'}</td>
                  <td className="table-cell">
                    <span className="text-gray-700 dark:text-gray-300 font-medium">
                      {item.estimated_cost != null ? `$${Number(item.estimated_cost).toLocaleString()}` : '—'}
                    </span>
                  </td>
                  <td className="table-cell"><StatusBadge status={item.status} /></td>
                  <td className="table-cell"><PriorityBadge priority={item.priority} /></td>
                  <td className="table-cell text-gray-500 whitespace-nowrap">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {item.status === 'draft' && canManage && (
                        <ActionBtn icon={Edit3} title="Edit" color="blue" onClick={() => openEdit(item)} />
                      )}
                      {item.status === 'draft' && (
                        <ActionBtn icon={Send} title="Submit for Approval" color="yellow"
                          onClick={() => { if (confirm(`Submit ${item.pr_number} for approval?`)) handleSubmitPR(item) }} />
                      )}
                      {item.status === 'pending_approval' && canApprove && (
                        <>
                          <ActionBtn icon={CheckCircle} title="Approve" color="green"
                            onClick={() => { setDetailItem(item); setApprovalNotes(''); setApprovedCost(item.estimated_cost ?? '') }} />
                          <ActionBtn icon={XCircle} title="Reject" color="red"
                            onClick={() => { setDetailItem(item); setApprovalNotes('') }} />
                        </>
                      )}
                      {item.status === 'approved' && canManage && (
                        <ActionBtn icon={FileText} title="Issue PO" color="indigo"
                          onClick={() => { if (confirm(`Issue PO for ${item.pr_number}?`)) handleIssuePO(item) }} />
                      )}
                      {item.status === 'po_issued' && canManage && (
                        <ActionBtn icon={Package} title="Mark Received" color="teal"
                          onClick={() => openDetail(item)} />
                      )}
                      {item.status === 'draft' && canManage && (
                        <ActionBtn icon={Trash2} title="Delete" color="red" onClick={() => handleDelete(item)} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {modalOpen && (
        <ModalOverlay onClose={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-[#16161e] border border-gray-200 dark:border-[#2a2a35] rounded-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-[#2a2a35]">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ShoppingCart size={20} className="text-blue-500" />
                {editItem ? `Edit ${editItem.pr_number}` : 'New Procurement Request'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 grid grid-cols-2 gap-4">
              {/* Request Type */}
              <div>
                <label className="label">Request Type *</label>
                <select className="input" value={form.request_type} onChange={e => setField('request_type', e.target.value)} required>
                  {REQUEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {/* Priority */}
              <div>
                <label className="label">Priority</label>
                <select className="input" value={form.priority} onChange={e => setField('priority', e.target.value)}>
                  {PRIORITIES.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
                </select>
              </div>
              {/* Title */}
              <div className="col-span-2">
                <label className="label">Title *</label>
                <input className="input" value={form.title} onChange={e => setField('title', e.target.value)} required placeholder="e.g. Laptop procurement for new hires" />
              </div>

              {/* HAM-specific: Manufacturer + Model + EOL check */}
              {form.request_type === 'HAM' && (
                <>
                  <div>
                    <label className="label">Manufacturer</label>
                    <input className="input" value={form.manufacturer} onChange={e => { setField('manufacturer', e.target.value); setEolResult(null) }} placeholder="e.g. Dell, HP, Cisco" />
                  </div>
                  <div>
                    <label className="label">Model</label>
                    <input className="input" value={form.model} onChange={e => { setField('model', e.target.value); setEolResult(null) }} placeholder="e.g. PowerEdge R750, XPS 15" />
                  </div>

                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={checkEOL}
                      disabled={eolChecking || (!form.manufacturer && !form.model)}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-purple-600/20 hover:bg-purple-600/30 text-purple-600 dark:text-purple-300 border border-purple-300 dark:border-purple-600/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {eolChecking
                        ? <><Loader2 size={13} className="animate-spin" /> Checking EOL status…</>
                        : <><Cpu size={13} /> Check End-of-Life (AI)</>
                      }
                    </button>

                    {eolResult && (
                      <div className={`mt-2 p-3 rounded-xl border text-xs space-y-1.5 ${
                        eolResult.is_eol === true  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/40' :
                        eolResult.is_eol === false ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700/40' :
                        'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/40'
                      }`}>
                        <div className="flex items-center gap-2 font-semibold">
                          {eolResult.is_eol === true  && <><AlertTriangle size={13} className="text-red-500" /><span className="text-red-600 dark:text-red-400">End of Life</span></>}
                          {eolResult.is_eol === false && <><CheckCircle size={13} className="text-green-500" /><span className="text-green-600 dark:text-green-400">Actively Supported</span></>}
                          {eolResult.is_eol === null  && <><AlertCircle size={13} className="text-gray-400" /><span className="text-gray-500">Status Unknown</span></>}
                          {eolResult.confidence && eolResult.confidence !== 'none' && (
                            <span className="ml-auto text-gray-400 font-normal capitalize">{eolResult.confidence} confidence</span>
                          )}
                        </div>
                        {eolResult.eol_date && <p className="text-gray-700 dark:text-gray-300">EOL Date: <span className="font-medium">{eolResult.eol_date}</span></p>}
                        {eolResult.support_end_date && <p className="text-gray-700 dark:text-gray-300">Support ends: <span className="font-medium">{eolResult.support_end_date}</span></p>}
                        {eolResult.replacement && <p className="text-blue-600 dark:text-blue-300">Recommended replacement: <span className="font-medium">{eolResult.replacement}</span></p>}
                        {eolResult.notes && <p className="text-gray-500 italic">{eolResult.notes}</p>}
                        {eolResult.vendor_url && (
                          <a href={eolResult.vendor_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
                            Vendor EOL page <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Category */}
              <div>
                <label className="label">Category</label>
                <input className="input" value={form.category} onChange={e => setField('category', e.target.value)} placeholder="e.g. Laptop, Microsoft 365" />
              </div>
              {/* Department */}
              <div>
                <label className="label">Department</label>
                <input className="input" value={form.department} onChange={e => setField('department', e.target.value)} placeholder="e.g. Engineering" />
              </div>

              {/* Vendor — dropdown from vendor list */}
              <div className="col-span-2">
                <label className="label">Vendor</label>
                <select
                  className="input"
                  value={form.vendor_id || (form.vendor_name ? '__other__' : '')}
                  onChange={e => {
                    if (e.target.value === '__other__') {
                      setField('vendor_id', '')
                    } else {
                      handleVendorSelect(e.target.value)
                    }
                  }}
                >
                  <option value="">— Select vendor —</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name} {v.type ? `(${v.type})` : ''}</option>
                  ))}
                  <option value="__other__">Other (type below)</option>
                </select>
                {(!form.vendor_id) && (
                  <input
                    className="input mt-2"
                    value={form.vendor_name}
                    onChange={e => setField('vendor_name', e.target.value)}
                    placeholder="Type vendor name if not in list…"
                  />
                )}
              </div>

              {/* Estimated Cost */}
              <div>
                <label className="label">Estimated Cost ($)</label>
                <div className="relative">
                  <DollarSign size={15} className="absolute left-3 top-2.5 text-gray-400" />
                  <input type="number" step="0.01" min="0" className="input pl-8" value={form.estimated_cost}
                    onChange={e => setField('estimated_cost', e.target.value)} placeholder="0.00" />
                </div>
              </div>
              {/* Quantity */}
              <div>
                <label className="label">Quantity</label>
                <input type="number" min="1" step="any" className="input" value={form.quantity}
                  onChange={e => setField('quantity', e.target.value)} />
              </div>
              {/* Unit */}
              <div>
                <label className="label">Unit</label>
                <select className="input" value={form.unit} onChange={e => setField('unit', e.target.value)}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              {/* Justification */}
              <div className="col-span-2">
                <label className="label">Justification</label>
                <textarea className="input" rows={3} value={form.justification}
                  onChange={e => setField('justification', e.target.value)}
                  placeholder="Business reason for this procurement..." />
              </div>
              {/* Description */}
              <div className="col-span-2">
                <label className="label">Description</label>
                <textarea className="input" rows={2} value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="Additional details..." />
              </div>
              {/* Actions */}
              <div className="col-span-2 flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
                  {saving ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
                  {editItem ? 'Update Request' : 'Create Request'}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}

      {/* ── Detail / Action Modal ───────────────────────────────────────────── */}
      {detailItem && (
        <ModalOverlay onClose={closeDetail}>
          <div className="bg-white dark:bg-[#16161e] border border-gray-200 dark:border-[#2a2a35] rounded-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-200 dark:border-[#2a2a35]">
              <div>
                <p className="font-mono text-blue-500 text-sm font-semibold">{detailItem.pr_number}</p>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{detailItem.title}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <StatusBadge status={detailItem.status} />
                  <PriorityBadge priority={detailItem.priority} />
                </div>
              </div>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors text-xl leading-none ml-4">&times;</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <DetailRow label="Type"       value={detailItem.request_type} />
                <DetailRow label="Category"   value={detailItem.category} />
                <DetailRow label="Requester"  value={detailItem.requester_name} />
                <DetailRow label="Department" value={detailItem.department} />
                <DetailRow label="Vendor"     value={detailItem.vendor_name} />
                <DetailRow label="Quantity"   value={detailItem.quantity ? `${detailItem.quantity} ${detailItem.unit}` : null} />
                <DetailRow label="Est. Cost"  value={detailItem.estimated_cost != null ? `$${Number(detailItem.estimated_cost).toLocaleString()}` : null} />
                {detailItem.approved_cost != null && (
                  <DetailRow label="Approved Cost" value={`$${Number(detailItem.approved_cost).toLocaleString()}`} />
                )}
                {detailItem.po_number && (
                  <DetailRow label="PO Number" value={detailItem.po_number} mono />
                )}
                <DetailRow label="Created" value={detailItem.created_at ? new Date(detailItem.created_at).toLocaleString() : null} />
                {detailItem.received_at && (
                  <DetailRow label="Received At" value={new Date(detailItem.received_at).toLocaleString()} />
                )}
              </div>

              {/* Approver Details — shown whenever there is an approver */}
              {detailItem.approver_name && (
                <div className={`rounded-xl p-4 border space-y-2 ${
                  detailItem.status === 'rejected'
                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-700/40'
                    : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700/40'
                }`}>
                  <p className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                    detailItem.status === 'rejected' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                  }`}>
                    {detailItem.status === 'rejected' ? <XCircle size={13} /> : <CheckCircle size={13} />}
                    {detailItem.status === 'rejected' ? 'Rejected' : 'Approved'}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                      <User size={12} />
                      <span className="font-medium text-gray-800 dark:text-gray-200">{detailItem.approver_name}</span>
                    </div>
                    {detailItem.approved_at && (
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Calendar size={12} />
                        <span>{new Date(detailItem.approved_at).toLocaleString()}</span>
                      </div>
                    )}
                    {detailItem.approved_cost != null && detailItem.status !== 'rejected' && (
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <DollarSign size={12} />
                        <span>Approved: <span className="font-semibold text-gray-800 dark:text-gray-200">${Number(detailItem.approved_cost).toLocaleString()}</span></span>
                      </div>
                    )}
                  </div>
                  {detailItem.approval_notes && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 bg-white/60 dark:bg-black/20 rounded-lg px-3 py-2 italic">
                      "{detailItem.approval_notes}"
                    </p>
                  )}
                </div>
              )}

              {detailItem.justification && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Justification</p>
                  <p className="text-gray-700 dark:text-gray-300 text-sm bg-gray-50 dark:bg-[#0e0e12] rounded-lg p-3 border border-gray-200 dark:border-[#2a2a35]">{detailItem.justification}</p>
                </div>
              )}
              {detailItem.description && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-gray-700 dark:text-gray-300 text-sm bg-gray-50 dark:bg-[#0e0e12] rounded-lg p-3 border border-gray-200 dark:border-[#2a2a35]">{detailItem.description}</p>
                </div>
              )}
              {detailItem.received_notes && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Received Notes</p>
                  <p className="text-gray-700 dark:text-gray-300 text-sm bg-gray-50 dark:bg-[#0e0e12] rounded-lg p-3 border border-gray-200 dark:border-[#2a2a35]">{detailItem.received_notes}</p>
                </div>
              )}

              {/* ── Approval section ──────────────────────────────────────── */}
              {detailItem.status === 'pending_approval' && canApprove && (
                <div className="border border-yellow-200 dark:border-[#2a2a35] rounded-xl p-4 space-y-3 bg-yellow-50 dark:bg-[#0e0e12]">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <AlertCircle size={16} className="text-yellow-500" /> Approval Required
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="label">Approval Notes</label>
                      <textarea
                        className="input"
                        rows={3}
                        value={approvalNotes}
                        onChange={e => setApprovalNotes(e.target.value)}
                        placeholder="Optional notes for the requester..."
                      />
                    </div>
                    <div>
                      <label className="label">Approved Cost ($)</label>
                      <div className="relative">
                        <DollarSign size={15} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                          type="number" step="0.01" min="0"
                          className="input pl-8"
                          value={approvedCost}
                          onChange={e => setApprovedCost(e.target.value)}
                          placeholder={detailItem.estimated_cost}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Est: ${Number(detailItem.estimated_cost || 0).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprovePR(detailItem)}
                      disabled={actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectPR(detailItem)}
                      disabled={actionLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <XCircle size={14} />}
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {/* ── Issue PO section ──────────────────────────────────────── */}
              {detailItem.status === 'approved' && canManage && (
                <div className="border border-blue-200 dark:border-[#2a2a35] rounded-xl p-4 bg-blue-50 dark:bg-[#0e0e12]">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                    <FileText size={16} className="text-blue-500" /> Issue Purchase Order
                  </p>
                  <button
                    onClick={() => handleIssuePO(detailItem)}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
                    Issue PO
                  </button>
                </div>
              )}

              {/* ── Receive section ───────────────────────────────────────── */}
              {detailItem.status === 'po_issued' && canManage && (
                <div className="border border-teal-200 dark:border-[#2a2a35] rounded-xl p-4 space-y-3 bg-teal-50 dark:bg-[#0e0e12]">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Package size={16} className="text-teal-500" /> Mark as Received
                  </p>
                  {detailItem.po_number && (
                    <p className="text-xs text-gray-500">PO: <span className="font-mono text-blue-500">{detailItem.po_number}</span></p>
                  )}
                  <div>
                    <label className="label">Received Notes</label>
                    <textarea
                      className="input"
                      rows={3}
                      value={receivedNotes}
                      onChange={e => setReceivedNotes(e.target.value)}
                      placeholder="Condition notes, serial numbers, partial delivery details..."
                    />
                  </div>
                  <button
                    onClick={() => handleReceive(detailItem)}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Package size={14} />}
                    Mark Received
                  </button>
                </div>
              )}

              {/* ── Submit section ────────────────────────────────────────── */}
              {detailItem.status === 'draft' && (
                <div className="border border-gray-200 dark:border-[#2a2a35] rounded-xl p-4 bg-gray-50 dark:bg-[#0e0e12] flex items-center justify-between">
                  <p className="text-sm text-gray-500">Ready to submit this request for approval?</p>
                  <button
                    onClick={() => handleSubmitPR(detailItem)}
                    disabled={actionLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    Submit for Approval
                  </button>
                </div>
              )}

              {/* Footer close */}
              <div className="flex justify-end pt-2">
                <button onClick={closeDetail} className="btn-secondary">Close</button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function ActionBtn({ icon: Icon, title, color, onClick }) {
  const colors = {
    blue:   'hover:text-blue-500',
    yellow: 'hover:text-yellow-500',
    green:  'hover:text-green-500',
    red:    'hover:text-red-500',
    indigo: 'hover:text-indigo-500',
    teal:   'hover:text-teal-500',
  }
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400 ${colors[color] || ''} transition-colors`}
    >
      <Icon size={15} />
    </button>
  )
}

function ModalOverlay({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {children}
    </div>
  )
}

function DetailRow({ label, value, mono }) {
  if (!value && value !== 0) return null
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-gray-800 dark:text-gray-200 mt-0.5 ${mono ? 'font-mono text-blue-500' : ''}`}>{value}</p>
    </div>
  )
}
