import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Search, Edit, Trash2, RefreshCw, Monitor, ShieldCheck, ShieldOff, AlertTriangle, ChevronDown, ChevronUp, Cpu, Bot, User, Link2, ArrowRightLeft, Clock, CheckCircle, XCircle, ExternalLink, Eye, Package, GitBranch } from 'lucide-react'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { useAuth } from '../../contexts/AuthContext'

const statusVariant = { active: 'success', inactive: 'default', in_repair: 'warning', retired: 'danger', disposed: 'danger' }
const conditionVariant = { excellent: 'success', good: 'success', fair: 'warning', poor: 'danger' }
const hwTypes = ['Laptop', 'Desktop', 'Server', 'Mobile', 'Monitor', 'Printer', 'Network Switch', 'Firewall', 'Router', 'Storage', 'Tablet', 'Peripheral', 'Other']

const RELATIONSHIP_LABELS = {
  installed_on: 'Installed On', runs_on: 'Runs On', connected_to: 'Connected To',
  depends_on: 'Depends On', licensed_for: 'Licensed For', covered_by: 'Covered By',
  accessory_of: 'Accessory Of', replacement_for: 'Replacement For', backup_of: 'Backup Of',
  managed_by: 'Managed By', used_by: 'Used By', hosts: 'Hosts', part_of: 'Part Of',
}

function warrantyState(a) {
  if (!a.warranty_expiry) return 'none'
  const exp = new Date(a.warranty_expiry), now = new Date(), in90 = new Date(Date.now() + 90 * 86400000)
  if (exp < now) return 'out'
  if (exp < in90) return 'expiring'
  return 'in'
}

// ── Relationship Graph (SVG connection map) ─────────────────────────────────
const TYPE_COLORS = { hardware: '#3b82f6', software: '#8b5cf6', contract: '#f59e0b', license: '#10b981' }
const TYPE_BG = { hardware: '#eff6ff', software: '#f5f3ff', contract: '#fffbeb', license: '#ecfdf5' }
const TYPE_DARK_BG = { hardware: '#1e3a5f', software: '#2e1065', contract: '#451a03', license: '#064e3b' }

function RelationshipGraph({ asset, relationships }) {
  const svgRef = useRef(null)
  if (!relationships || relationships.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-8">No relationships to visualize. Add relationships in the Relationships tab.</p>
  }

  // Build nodes: center = this asset, around = linked assets
  const centerNode = { id: `hardware-${asset.id}`, name: asset.name, type: 'hardware', x: 0, y: 0 }
  const linkedMap = new Map()
  relationships.forEach(r => {
    const isSource = r.source_type === 'hardware' && r.source_id === asset.id
    const linkedType = isSource ? r.target_type : r.source_type
    const linkedId = isSource ? r.target_id : r.source_id
    const linkedName = isSource ? r.target_name : r.source_name
    const key = `${linkedType}-${linkedId}`
    if (!linkedMap.has(key)) {
      linkedMap.set(key, { id: key, name: linkedName || `${linkedType} #${linkedId}`, type: linkedType, rels: [] })
    }
    linkedMap.get(key).rels.push(r.relationship)
  })

  const linked = Array.from(linkedMap.values())
  const count = linked.length
  const svgW = 700, svgH = Math.max(380, count > 6 ? 480 : 380)
  const cx = svgW / 2, cy = svgH / 2
  const radius = Math.min(svgW, svgH) * 0.35

  // Position linked nodes in a circle around center
  linked.forEach((node, i) => {
    const angle = (2 * Math.PI * i / count) - Math.PI / 2
    node.x = cx + radius * Math.cos(angle)
    node.y = cy + radius * Math.sin(angle)
  })

  return (
    <div className="flex flex-col items-center">
      <svg ref={svgRef} viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-[700px]" style={{ minHeight: '340px' }}>
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#6b7280" /></marker>
        </defs>
        {/* Connection lines */}
        {linked.map(node => {
          const color = TYPE_COLORS[node.type] || '#6b7280'
          return (
            <g key={node.id}>
              <line x1={cx} y1={cy} x2={node.x} y2={node.y} stroke={color} strokeWidth="2" strokeOpacity="0.5" markerEnd="url(#arrowhead)" />
              {/* Label on line */}
              {node.rels.map((rel, ri) => {
                const mx = (cx + node.x) / 2
                const my = (cy + node.y) / 2 + ri * 12
                return (
                  <text key={ri} x={mx} y={my} textAnchor="middle" className="fill-gray-500 dark:fill-gray-400" style={{ fontSize: '9px', fontWeight: 500 }}>
                    {RELATIONSHIP_LABELS[rel] || rel}
                  </text>
                )
              })}
            </g>
          )
        })}
        {/* Center node */}
        <g>
          <rect x={cx - 60} y={cy - 22} width={120} height={44} rx={10} fill={TYPE_COLORS.hardware} fillOpacity="0.15" stroke={TYPE_COLORS.hardware} strokeWidth="2" />
          <text x={cx} y={cy - 4} textAnchor="middle" className="fill-blue-600 dark:fill-blue-400" style={{ fontSize: '11px', fontWeight: 700 }}>
            {asset.name?.length > 16 ? asset.name.slice(0, 16) + '...' : asset.name}
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" className="fill-gray-400" style={{ fontSize: '9px' }}>This Asset</text>
        </g>
        {/* Linked nodes */}
        {linked.map(node => {
          const color = TYPE_COLORS[node.type] || '#6b7280'
          const displayName = node.name?.length > 20 ? node.name.slice(0, 20) + '...' : node.name
          return (
            <g key={node.id}>
              <rect x={node.x - 55} y={node.y - 20} width={110} height={40} rx={8} fill={color} fillOpacity="0.1" stroke={color} strokeWidth="1.5" />
              <text x={node.x} y={node.y - 4} textAnchor="middle" style={{ fontSize: '10px', fontWeight: 600, fill: color }}>
                {displayName}
              </text>
              <text x={node.x} y={node.y + 10} textAnchor="middle" className="fill-gray-400" style={{ fontSize: '8px', textTransform: 'capitalize' }}>
                {node.type}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="flex gap-4 mt-2">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color, opacity: 0.6 }}></span>
            <span className="capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Asset Detail Modal ───────────────────────────────────────────────────────
function AssetDetailModal({ asset, isOpen, onClose, canEdit, onRefresh }) {
  const [detail, setDetail] = useState(null)
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(false)
  // Loan form
  const [loanForm, setLoanForm] = useState({ loaned_to: '', loaned_to_email: '', loaned_to_department: '', due_date: '', condition_out: 'good', purpose: '' })
  const [loanMsg, setLoanMsg] = useState(null)
  // Relationship form
  const [relForm, setRelForm] = useState({ target_type: 'software', target_id: '', relationship: 'installed_on', description: '' })
  const [relTargetList, setRelTargetList] = useState([])
  const [relMsg, setRelMsg] = useState(null)

  useEffect(() => {
    if (!asset || !isOpen) return
    setLoading(true)
    setTab('overview')
    api.get(`/hardware/${asset.id}`).then(r => setDetail(r.data)).finally(() => setLoading(false))
  }, [asset, isOpen])

  // Fetch all items of the selected target type for the dropdown
  useEffect(() => {
    if (!isOpen) return
    const type = relForm.target_type
    let endpoint = ''
    if (type === 'hardware') endpoint = '/hardware'
    else if (type === 'software') endpoint = '/software'
    else if (type === 'contract') endpoint = '/contracts'
    else if (type === 'license') endpoint = '/licenses'
    if (!endpoint) return
    api.get(endpoint).then(r => {
      const items = r.data.data || r.data || []
      setRelTargetList(items.map(i => ({
        id: i.id,
        name: i.name || i.title || `#${i.id}`,
        sub: type === 'hardware' ? (i.asset_tag || i.type) : type === 'software' ? (i.vendor || i.category) : type === 'contract' ? i.type : (i.license_type || ''),
      })))
    }).catch(() => setRelTargetList([]))
  }, [relForm.target_type, isOpen])

  const handleCheckout = async (e) => {
    e.preventDefault()
    setLoanMsg(null)
    try {
      await api.post('/asset-management/loans', { asset_type: 'hardware', asset_id: asset.id, ...loanForm })
      setLoanMsg({ ok: true, text: 'Asset checked out successfully' })
      setLoanForm({ loaned_to: '', loaned_to_email: '', loaned_to_department: '', due_date: '', condition_out: 'good', purpose: '' })
      const r = await api.get(`/hardware/${asset.id}`)
      setDetail(r.data)
      onRefresh()
    } catch (err) { setLoanMsg({ ok: false, text: err.response?.data?.error || 'Checkout failed' }) }
  }

  const handleCheckin = async (loanId) => {
    const condition = prompt('Return condition? (excellent / good / fair / poor)', 'good')
    if (!condition) return
    try {
      await api.put(`/asset-management/loans/${loanId}/checkin`, { condition_in: condition })
      const r = await api.get(`/hardware/${asset.id}`)
      setDetail(r.data)
      onRefresh()
    } catch (err) { alert(err.response?.data?.error || 'Checkin failed') }
  }

  const handleAddRelationship = async (e) => {
    e.preventDefault()
    setRelMsg(null)
    try {
      await api.post('/asset-management/relationships', { source_type: 'hardware', source_id: asset.id, ...relForm })
      setRelMsg({ ok: true, text: 'Relationship created' })
      setRelForm(f => ({ ...f, target_id: '', description: '' }))
      const r = await api.get(`/hardware/${asset.id}`)
      setDetail(r.data)
    } catch (err) { setRelMsg({ ok: false, text: err.response?.data?.error || 'Failed' }) }
  }

  const handleDeleteRel = async (relId) => {
    if (!confirm('Remove this relationship?')) return
    await api.delete(`/asset-management/relationships/${relId}`)
    const r = await api.get(`/hardware/${asset.id}`)
    setDetail(r.data)
  }

  if (!isOpen) return null
  const d = detail
  const customFields = d?.custom_fields || {}

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'loans', label: 'Loan Registry', icon: ArrowRightLeft },
    { id: 'relationships', label: 'Relationships', icon: Link2 },
    { id: 'graph', label: 'Connection Map', icon: GitBranch },
    { id: 'type_fields', label: 'Type Fields', icon: Package },
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={d?.name || 'Asset Details'} size="xl">
      {loading || !d ? (
        <div className="flex justify-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div>
          {/* Tabs */}
          <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-[#2a2a35] pb-2">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1e1e28]'}`}>
                <t.icon size={13} />{t.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {tab === 'overview' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1.5">
                <p className="text-gray-400 font-semibold uppercase text-[10px]">Identity</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Tag:</span> {d.asset_tag}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Serial:</span> {d.serial_number || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Type:</span> {d.type}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Manufacturer:</span> {d.manufacturer || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Model:</span> {d.model || '—'}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-gray-400 font-semibold uppercase text-[10px]">System</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">OS:</span> {d.os || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Processor:</span> {d.processor || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">RAM:</span> {d.ram || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Storage:</span> {d.storage || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">IP:</span> {d.ip_address || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">MAC:</span> {d.mac_address || '—'}</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-gray-400 font-semibold uppercase text-[10px]">Assignment & Status</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Assigned:</span> {d.assigned_to || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Department:</span> {d.department || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Location:</span> {d.location || '—'}</p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Status:</span> <Badge variant={statusVariant[d.status]}>{d.status}</Badge></p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Condition:</span> <Badge variant={conditionVariant[d.condition]}>{d.condition}</Badge></p>
                <p className="text-gray-700 dark:text-gray-300"><span className="text-gray-400">Cost:</span> ${d.purchase_cost?.toLocaleString()}</p>
              </div>
              {/* Active loan badge */}
              {d.active_loan && (
                <div className="col-span-full p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-xl flex items-center gap-3">
                  <ArrowRightLeft size={16} className="text-yellow-600" />
                  <div>
                    <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">Currently on Loan</p>
                    <p className="text-[10px] text-gray-500">To: {d.active_loan.loaned_to} — Due: {d.active_loan.due_date ? new Date(d.active_loan.due_date).toLocaleDateString() : 'No due date'}</p>
                  </div>
                </div>
              )}
              {/* Relationship summary */}
              {d.relationships?.length > 0 && (
                <div className="col-span-full">
                  <p className="text-gray-400 font-semibold uppercase text-[10px] mb-1">Linked Assets ({d.relationships.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.relationships.slice(0, 6).map(r => (
                      <span key={r.id} className="text-[10px] px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full border border-blue-200 dark:border-blue-800/40">
                        {RELATIONSHIP_LABELS[r.relationship] || r.relationship}: {r.source_id === d.id ? r.target_name : r.source_name}
                      </span>
                    ))}
                    {d.relationships.length > 6 && <span className="text-[10px] text-gray-400">+{d.relationships.length - 6} more</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loan Registry Tab */}
          {tab === 'loans' && (
            <div className="space-y-4">
              {/* Checkout form */}
              {canEdit && !d.active_loan && (
                <form onSubmit={handleCheckout} className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-xl">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><ArrowRightLeft size={14} className="text-blue-500" /> Checkout Asset</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className="label">Loan To *</label><input className="input" required value={loanForm.loaned_to} onChange={e => setLoanForm(f => ({ ...f, loaned_to: e.target.value }))} /></div>
                    <div><label className="label">Email</label><input className="input" value={loanForm.loaned_to_email} onChange={e => setLoanForm(f => ({ ...f, loaned_to_email: e.target.value }))} /></div>
                    <div><label className="label">Department</label><input className="input" value={loanForm.loaned_to_department} onChange={e => setLoanForm(f => ({ ...f, loaned_to_department: e.target.value }))} /></div>
                    <div><label className="label">Due Date</label><input type="date" className="input" value={loanForm.due_date} onChange={e => setLoanForm(f => ({ ...f, due_date: e.target.value }))} /></div>
                    <div><label className="label">Condition Out</label>
                      <select className="input" value={loanForm.condition_out} onChange={e => setLoanForm(f => ({ ...f, condition_out: e.target.value }))}>
                        {['excellent', 'good', 'fair', 'poor'].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Purpose</label><input className="input" value={loanForm.purpose} onChange={e => setLoanForm(f => ({ ...f, purpose: e.target.value }))} /></div>
                  </div>
                  {loanMsg && <p className={`text-xs mt-2 ${loanMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{loanMsg.text}</p>}
                  <button type="submit" className="btn-primary mt-3 text-xs">Checkout</button>
                </form>
              )}
              {/* Active loan */}
              {d.active_loan && canEdit && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">Currently Loaned to {d.active_loan.loaned_to}</p>
                    <p className="text-[10px] text-gray-500">Checked out {new Date(d.active_loan.checkout_date).toLocaleDateString()} — Due: {d.active_loan.due_date ? new Date(d.active_loan.due_date).toLocaleDateString() : 'No date'}</p>
                    {d.active_loan.purpose && <p className="text-[10px] text-gray-400 mt-0.5">Purpose: {d.active_loan.purpose}</p>}
                  </div>
                  <button onClick={() => handleCheckin(d.active_loan.id)} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium flex items-center gap-1"><CheckCircle size={13} /> Check In</button>
                </div>
              )}
              {/* Loan history */}
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Loan History ({d.loans?.length || 0})</p>
              {d.loans?.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {d.loans.map(l => {
                    const overdue = l.status === 'checked_out' && l.due_date && new Date(l.due_date) < new Date()
                    return (
                      <div key={l.id} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-lg">
                        {l.status === 'checked_out' ? <Clock size={13} className={overdue ? 'text-red-500' : 'text-yellow-500'} /> : <CheckCircle size={13} className="text-green-500" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 dark:text-gray-300"><span className="font-medium">{l.loaned_to}</span> {l.loaned_to_department && <span className="text-gray-400">({l.loaned_to_department})</span>}</p>
                          <p className="text-[10px] text-gray-500">
                            {new Date(l.checkout_date).toLocaleDateString()} → {l.checkin_date ? new Date(l.checkin_date).toLocaleDateString() : 'Not returned'}
                            {l.due_date && <span> — Due: {new Date(l.due_date).toLocaleDateString()}</span>}
                            {overdue && <span className="text-red-500 font-semibold ml-1">OVERDUE</span>}
                          </p>
                        </div>
                        <Badge variant={l.status === 'returned' ? 'success' : overdue ? 'danger' : 'warning'}>{l.status === 'returned' ? 'Returned' : overdue ? 'Overdue' : 'Out'}</Badge>
                      </div>
                    )
                  })}
                </div>
              ) : <p className="text-xs text-gray-400">No loan history for this asset.</p>}
            </div>
          )}

          {/* Relationships Tab */}
          {tab === 'relationships' && (
            <div className="space-y-4">
              {canEdit && (
                <form onSubmit={handleAddRelationship} className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/30 rounded-xl">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"><Link2 size={14} className="text-indigo-500" /> Add Relationship</p>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="label">Relationship</label>
                      <select className="input" value={relForm.relationship} onChange={e => setRelForm(f => ({ ...f, relationship: e.target.value }))}>
                        {Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Target Type</label>
                      <select className="input" value={relForm.target_type} onChange={e => { setRelForm(f => ({ ...f, target_type: e.target.value, target_id: '' })) }}>
                        {['hardware', 'software', 'contract', 'license'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Select Target *</label>
                      <select className="input" value={relForm.target_id} onChange={e => setRelForm(f => ({ ...f, target_id: e.target.value }))}>
                        <option value="">— Select {relForm.target_type} —</option>
                        {relTargetList.map(item => (
                          <option key={item.id} value={item.id}>{item.name}{item.sub ? ` (${item.sub})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Description</label>
                      <input className="input" value={relForm.description} onChange={e => setRelForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                  </div>
                  {relMsg && <p className={`text-xs mt-2 ${relMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{relMsg.text}</p>}
                  <button type="submit" disabled={!relForm.target_id} className="btn-primary mt-3 text-xs disabled:opacity-50">Add Relationship</button>
                </form>
              )}
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Relationships ({d.relationships?.length || 0})</p>
              {d.relationships?.length > 0 ? (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {d.relationships.map(r => {
                    const isSource = r.source_type === 'hardware' && r.source_id === d.id
                    const linkedName = isSource ? r.target_name : r.source_name
                    const linkedType = isSource ? r.target_type : r.source_type
                    return (
                      <div key={r.id} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-lg">
                        <Link2 size={13} className="text-indigo-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 dark:text-gray-300">
                            <span className="font-medium text-indigo-600 dark:text-indigo-400">{RELATIONSHIP_LABELS[r.relationship] || r.relationship}</span>
                            {' → '}
                            <span className="font-medium">{linkedName}</span>
                          </p>
                          <p className="text-[10px] text-gray-500">{linkedType}{r.description ? ` — ${r.description}` : ''}</p>
                        </div>
                        {canEdit && <button onClick={() => handleDeleteRel(r.id)} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>}
                      </div>
                    )
                  })}
                </div>
              ) : <p className="text-xs text-gray-400">No relationships defined for this asset.</p>}
            </div>
          )}

          {/* Connection Map Tab */}
          {tab === 'graph' && d && (
            <RelationshipGraph asset={d} relationships={d.relationships || []} />
          )}

          {/* Type Fields Tab */}
          {tab === 'type_fields' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Type-specific fields for <span className="font-semibold text-gray-700 dark:text-gray-300">{d.type}</span> assets:</p>
              {d.type_fields?.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {d.type_fields.map(f => (
                    <div key={f.field_name} className="p-3 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-lg">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">{f.field_label}</p>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5">{customFields[f.field_name] || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-gray-400">No type-specific fields defined for {d.type}.</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Loan Registry Page Tab ───────────────────────────────────────────────────
function LoanRegistry() {
  const [loans, setLoans] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const { hasRole } = useAuth()
  const canEdit = hasRole('super_admin', 'it_admin', 'it_manager', 'asset_manager')

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/asset-management/loans', { params: { status: filter || undefined, search: search || undefined } }),
      api.get('/asset-management/loans/stats'),
    ]).then(([loansR, statsR]) => {
      setLoans(loansR.data.data)
      setStats(statsR.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filter, search])

  const handleCheckin = async (loan) => {
    const condition = prompt('Return condition?', 'good')
    if (!condition) return
    await api.put(`/asset-management/loans/${loan.id}/checkin`, { condition_in: condition })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Loans', value: stats.total || 0, color: 'text-blue-600' },
          { label: 'Checked Out', value: stats.checked_out || 0, color: 'text-yellow-600' },
          { label: 'Overdue', value: stats.overdue || 0, color: 'text-red-600' },
          { label: 'Returned', value: stats.returned || 0, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="card p-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{s.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card p-4 flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input placeholder="Search loans..." className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-40" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="checked_out">Checked Out</option>
          <option value="returned">Returned</option>
        </select>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} /></button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">Asset</th>
                <th className="table-header">Loaned To</th>
                <th className="table-header">Checkout</th>
                <th className="table-header">Due Date</th>
                <th className="table-header">Status</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading...</td></tr>
              ) : loans.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No loan records found</td></tr>
              ) : loans.map(l => {
                const overdue = l.status === 'checked_out' && l.due_date && new Date(l.due_date) < new Date()
                return (
                  <tr key={l.id} className="table-row">
                    <td className="table-cell">
                      <p className="font-medium text-gray-900 dark:text-white text-xs">{l.asset_name}</p>
                      <p className="text-[10px] text-gray-400">{l.asset_type}</p>
                    </td>
                    <td className="table-cell">
                      <p className="text-xs text-gray-700 dark:text-gray-300">{l.loaned_to}</p>
                      {l.loaned_to_department && <p className="text-[10px] text-gray-400">{l.loaned_to_department}</p>}
                    </td>
                    <td className="table-cell text-xs text-gray-600 dark:text-gray-400">{new Date(l.checkout_date).toLocaleDateString()}</td>
                    <td className="table-cell">
                      {l.due_date ? (
                        <span className={`text-xs ${overdue ? 'text-red-500 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>{new Date(l.due_date).toLocaleDateString()}{overdue && ' (OVERDUE)'}</span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="table-cell">
                      <Badge variant={l.status === 'returned' ? 'success' : overdue ? 'danger' : 'warning'}>{l.status === 'returned' ? 'Returned' : overdue ? 'Overdue' : 'Checked Out'}</Badge>
                    </td>
                    <td className="table-cell">
                      {l.status === 'checked_out' && canEdit && (
                        <button onClick={() => handleCheckin(l)} className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1"><CheckCircle size={12} /> Check In</button>
                      )}
                      {l.status === 'returned' && l.checkin_date && (
                        <span className="text-[10px] text-gray-400">Returned {new Date(l.checkin_date).toLocaleDateString()}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Row Component ────────────────────────────────────────────────────────────
function HardwareRow({ asset: a, canEdit, onEdit, onDelete, onView }) {
  const isAgent = a.asset_tag?.startsWith('AGT-')
  return (
    <tr className="table-row">
      <td className="table-cell">
        <button onClick={() => onView(a)} className="text-gray-400 hover:text-blue-500"><Eye size={14} /></button>
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
        <Badge variant={statusVariant[a.status] || 'default'}>{a.status?.replace('_', ' ')}</Badge>
        <Badge variant={conditionVariant[a.condition] || 'default'} className="ml-1">{a.condition}</Badge>
      </td>
      <td className="table-cell text-xs text-gray-700 dark:text-gray-300">{a.assigned_to || '—'}</td>
      <td className="table-cell">
        <div className="space-y-1">
          {a.is_eol ? <div className="flex items-center gap-1"><AlertTriangle size={12} className="text-red-400" /><span className="text-[10px] font-semibold text-red-400">EOL</span></div> : null}
          {a.warranty_expiry ? (() => {
            const ws = warrantyState(a)
            const colors = { in: 'text-green-400', expiring: 'text-yellow-400', out: 'text-red-400' }
            const Icon = ws === 'in' ? ShieldCheck : ShieldOff
            return <div className="flex items-center gap-1"><Icon size={12} className={colors[ws]} /><span className={`text-[10px] font-medium ${colors[ws]}`}>{ws === 'in' ? 'Active' : ws === 'expiring' ? 'Expiring' : 'Expired'}</span></div>
          })() : <span className="text-gray-600 text-[10px]">N/A</span>}
        </div>
      </td>
      <td className="table-cell">
        {isAgent ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-purple-500 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full"><Bot size={10} /> Agent</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full"><User size={10} /> Manual</span>
        )}
      </td>
      <td className="table-cell">
        <div className="flex gap-1">
          <a href="https://app.sclera.com" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 hover:text-green-500 transition-colors" title="Monitor"><Monitor size={14} /></a>
          {canEdit && <>
            <button onClick={() => onEdit(a)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 hover:text-blue-400 transition-colors"><Edit size={14} /></button>
            <button onClick={() => onDelete(a.id)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-500 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
          </>}
        </div>
      </td>
    </tr>
  )
}

// ── Main Export ───────────────────────────────────────────────────────────────
const initialForm = { asset_tag: '', name: '', type: 'Laptop', manufacturer: '', model: '', serial_number: '', status: 'active', condition: 'good', location: '', assigned_to: '', department: '', purchase_date: '', purchase_cost: 0, warranty_expiry: '', warranty_status: 'active', warranty_provider: '', warranty_type: 'standard', ip_address: '', mac_address: '', os: '', processor: '', ram: '', storage: '', notes: '', is_eol: 0, eol_date: '', eol_replacement: '', eol_notes: '', custom_fields: {} }

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
  const [typeFields, setTypeFields] = useState([])
  const [pageTab, setPageTab] = useState('assets') // assets | loans
  const [detailAsset, setDetailAsset] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
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

  // Load type fields when form type changes
  useEffect(() => {
    if (form.type) {
      api.get(`/asset-management/type-fields/${form.type}`).then(r => setTypeFields(r.data.data || [])).catch(() => setTypeFields([]))
    }
  }, [form.type])

  const openAdd = () => { setEditItem(null); setForm(initialForm); setModalOpen(true) }
  const openEdit = (item) => {
    setEditItem(item)
    let cf = {}
    try { cf = item.custom_fields ? (typeof item.custom_fields === 'string' ? JSON.parse(item.custom_fields) : item.custom_fields) : {} } catch { }
    setForm({ ...initialForm, ...item, purchase_date: item.purchase_date?.split('T')[0] || '', warranty_expiry: item.warranty_expiry?.split('T')[0] || '', custom_fields: cf })
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

  const openDetail = (asset) => { setDetailAsset(asset); setDetailOpen(true) }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Hardware Assets</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{assets.length} hardware assets tracked</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && <button onClick={openAdd} className="btn-primary"><Plus size={18} /> Add Hardware</button>}
        </div>
      </div>

      {/* Page-level tabs */}
      <div className="flex gap-1">
        {[
          { id: 'assets', label: 'All Assets', icon: Cpu },
          { id: 'loans', label: 'Loan Registry', icon: ArrowRightLeft },
        ].map(t => (
          <button key={t.id} onClick={() => setPageTab(t.id)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pageTab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1e1e28] dark:text-gray-400'}`}>
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {pageTab === 'loans' ? <LoanRegistry /> : (
        <>
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

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total Assets', value: assets.length, color: 'text-blue-600' },
              { label: 'Active', value: assets.filter(a => a.status === 'active').length, color: 'text-green-600' },
              { label: 'Agent Discovered', value: assets.filter(a => a.asset_tag?.startsWith('AGT-')).length, color: 'text-purple-600' },
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
                    <th className="table-header">Status</th>
                    <th className="table-header">Assigned To</th>
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
                    <HardwareRow key={a.id} asset={a} canEdit={canEdit} onEdit={openEdit} onDelete={handleDelete} onView={openDetail} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit Modal with dynamic type fields */}
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
          <div><label className="label">Operating System</label><input className="input" value={form.os || ''} onChange={e => setForm(f => ({ ...f, os: e.target.value }))} /></div>
          <div><label className="label">Processor</label><input className="input" value={form.processor || ''} onChange={e => setForm(f => ({ ...f, processor: e.target.value }))} /></div>
          <div><label className="label">RAM</label><input className="input" value={form.ram || ''} onChange={e => setForm(f => ({ ...f, ram: e.target.value }))} /></div>
          <div><label className="label">Storage</label><input className="input" value={form.storage || ''} onChange={e => setForm(f => ({ ...f, storage: e.target.value }))} /></div>
          <div><label className="label">IP Address</label><input className="input" value={form.ip_address || ''} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))} /></div>
          <div><label className="label">MAC Address</label><input className="input" value={form.mac_address || ''} onChange={e => setForm(f => ({ ...f, mac_address: e.target.value }))} /></div>

          {/* Dynamic type-specific fields */}
          {typeFields.length > 0 && (
            <>
              <div className="col-span-2 border-t border-gray-200 dark:border-[#2a2a35] pt-3 mt-1">
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">{form.type} — Type-Specific Fields</p>
              </div>
              {typeFields.map(tf => (
                <div key={tf.field_name}>
                  <label className="label">{tf.field_label}</label>
                  {tf.field_type === 'select' && tf.options ? (
                    <select className="input" value={form.custom_fields?.[tf.field_name] || ''} onChange={e => setForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [tf.field_name]: e.target.value } }))}>
                      <option value="">—</option>
                      {tf.options.split(',').map(o => <option key={o}>{o.trim()}</option>)}
                    </select>
                  ) : tf.field_type === 'date' ? (
                    <input type="date" className="input" value={form.custom_fields?.[tf.field_name] || ''} onChange={e => setForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [tf.field_name]: e.target.value } }))} />
                  ) : (
                    <input className="input" value={form.custom_fields?.[tf.field_name] || ''} onChange={e => setForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [tf.field_name]: e.target.value } }))} />
                  )}
                </div>
              ))}
            </>
          )}

          <div className="col-span-2"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="col-span-2 flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editItem ? 'Update' : 'Add'} Asset</button>
          </div>
        </form>
      </Modal>

      {/* Asset Detail Modal (overview, loans, relationships, type fields) */}
      <AssetDetailModal asset={detailAsset} isOpen={detailOpen} onClose={() => setDetailOpen(false)} canEdit={canEdit} onRefresh={load} />
    </div>
  )
}
