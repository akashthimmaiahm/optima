import { useState, useEffect } from 'react'
import { Smartphone, RefreshCw, Plus, Lock, Shield, CheckCircle, XCircle, X, Trash2, Edit2, AlertTriangle } from 'lucide-react'
import api from '../../api/axios'

const PLATFORM_COLORS = {
  iOS: 'bg-gray-800/50 border-gray-700',
  Android: 'bg-green-900/20 border-green-800/30',
  Windows: 'bg-blue-900/20 border-blue-800/30',
  macOS: 'bg-purple-900/20 border-purple-800/30',
}
const PLATFORM_ICONS = { iOS: '🍎', Android: '🤖', Windows: '🪟', macOS: '💻', Linux: '🐧', ChromeOS: '🌐' }
const PLATFORM_OPTIONS = ['iOS', 'Android', 'Windows', 'macOS', 'Linux', 'ChromeOS']
const STATUS_OPTIONS = ['compliant', 'non_compliant', 'pending']
const DEPT_OPTIONS = ['IT', 'Engineering', 'Marketing', 'Sales', 'Operations', 'HR', 'Finance', 'Executive']
const OS_DEFAULTS = { iOS: 'iOS 17.3', Android: 'Android 14', Windows: 'Windows 11 23H2', macOS: 'macOS 14.3', Linux: 'Ubuntu 22.04', ChromeOS: 'ChromeOS 121' }

const POLICIES = [
  { name: 'Require Passcode', platforms: ['iOS', 'Android', 'Windows', 'macOS'], enforced: true },
  { name: 'Full Disk Encryption', platforms: ['Windows', 'macOS'], enforced: true },
  { name: 'Auto-Lock (5 min)', platforms: ['iOS', 'Android', 'Windows', 'macOS'], enforced: true },
  { name: 'Block Jailbroken/Rooted', platforms: ['iOS', 'Android'], enforced: true },
  { name: 'Remote Wipe Enabled', platforms: ['iOS', 'Android', 'Windows', 'macOS'], enforced: true },
  { name: 'OS Minimum Version', platforms: ['iOS', 'Android', 'Windows', 'macOS'], enforced: true },
  { name: 'Certificate-based Auth', platforms: ['Windows', 'macOS'], enforced: false },
  { name: 'VPN Required Off-Network', platforms: ['iOS', 'Android'], enforced: false },
]

const EMPTY_FORM = { name: '', platform: 'Windows', os: '', user: '', department: '', serial: '', status: 'pending', encrypted: false, passcode: false }

function EnrollModal({ onClose, onSave, initial, saving }) {
  const [form, setForm] = useState(
    initial
      ? { name: initial.name, platform: initial.platform, os: initial.os, user: initial.assigned_user, department: initial.department, serial: initial.serial, status: initial.status, encrypted: initial.encrypted, passcode: initial.passcode }
      : EMPTY_FORM
  )
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setCheck = k => e => setForm(f => ({ ...f, [k]: e.target.checked }))
  const handlePlatform = e => {
    const p = e.target.value
    setForm(f => ({ ...f, platform: p, os: f.os || OS_DEFAULTS[p] || '' }))
  }

  const inp = 'w-full px-3 py-2 rounded-lg border border-[#3a3a4a] bg-[#1e1e28] text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm placeholder-gray-600'

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1f] border border-[#2a2a35] rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-[#2a2a35]">
          <h2 className="font-semibold text-white">{initial ? 'Edit Device' : 'Enroll New Device'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#22222e] text-gray-500"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-400 mb-1">Device Name *</label>
              <input value={form.name} onChange={set('name')} className={inp} placeholder="e.g. John's iPhone 15 Pro" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Platform *</label>
              <select value={form.platform} onChange={handlePlatform} className={inp}>
                {PLATFORM_OPTIONS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Operating System</label>
              <input value={form.os} onChange={set('os')} className={inp} placeholder="e.g. iOS 17.3" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Assigned User (email)</label>
              <input value={form.user} onChange={set('user')} className={inp} placeholder="user@optima.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Department</label>
              <select value={form.department} onChange={set('department')} className={inp}>
                <option value="">— Select —</option>
                {DEPT_OPTIONS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Serial Number</label>
              <input value={form.serial} onChange={set('serial')} className={inp} placeholder="Device serial" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Compliance Status</label>
              <select value={form.status} onChange={set('status')} className={inp}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.encrypted} onChange={setCheck('encrypted')} className="w-4 h-4 accent-blue-600 rounded" />
              <span className="text-sm text-gray-300">Disk Encrypted</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.passcode} onChange={setCheck('passcode')} className="w-4 h-4 accent-blue-600 rounded" />
              <span className="text-sm text-gray-300">Passcode Set</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={() => onSave(form)} disabled={!form.name || !form.platform || saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
            {saving && <RefreshCw size={13} className="animate-spin" />}
            {initial ? 'Update Device' : 'Enroll Device'}
          </button>
          <button onClick={onClose} className="flex-1 py-2 bg-[#22222e] border border-[#3a3a4a] hover:bg-[#2a2a38] text-gray-300 rounded-lg text-sm font-medium transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function buildPlatformStats(devices) {
  const map = {}
  devices.forEach(d => {
    if (!map[d.platform]) map[d.platform] = { name: d.platform, enrolled: 0, compliant: 0 }
    map[d.platform].enrolled++
    if (d.status === 'compliant') map[d.platform].compliant++
  })
  return Object.values(map)
}

export default function MDM() {
  const [activeTab, setActiveTab] = useState('overview')
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [enrollModal, setEnrollModal] = useState(false)
  const [editDevice, setEditDevice] = useState(null)
  const [search, setSearch] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const fetchDevices = async () => {
    try {
      setLoading(true)
      const r = await api.get('/mdm/devices')
      setDevices(r.data)
      setError(null)
    } catch (e) {
      setError('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDevices() }, [])

  const total = devices.length
  const totalCompliant = devices.filter(d => d.status === 'compliant').length
  const nonCompliant = devices.filter(d => d.status === 'non_compliant').length
  const compliancePct = total > 0 ? Math.round((totalCompliant / total) * 100) : 0
  const platformStats = buildPlatformStats(devices)

  const sync = async () => {
    setSyncing(true)
    try {
      await api.post('/mdm/devices/sync')
      await fetchDevices()
    } finally {
      setSyncing(false)
    }
  }

  const saveDevice = async (form) => {
    setSaving(true)
    try {
      if (editDevice) {
        await api.put(`/mdm/devices/${editDevice.id}`, form)
      } else {
        await api.post('/mdm/devices', form)
      }
      await fetchDevices()
      setEnrollModal(false)
      setEditDevice(null)
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save device')
    } finally {
      setSaving(false)
    }
  }

  const removeDevice = async (id) => {
    if (!window.confirm('Remove this device from MDM?')) return
    try {
      await api.delete(`/mdm/devices/${id}`)
      setDevices(prev => prev.filter(d => d.id !== id))
    } catch {
      alert('Failed to remove device')
    }
  }

  const filtered = devices.filter(d => {
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !(d.assigned_user || '').toLowerCase().includes(search.toLowerCase())) return false
    if (filterPlatform && d.platform !== filterPlatform) return false
    if (filterStatus && d.status !== filterStatus) return false
    return true
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600/20 border border-purple-700/50 rounded-xl flex items-center justify-center">
            <Smartphone size={20} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">MDM — Mobile Device Management</h1>
            <p className="text-xs text-gray-500">Cross-platform device enrollment, policies &amp; compliance</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={sync} disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1f] border border-[#2a2a35] text-gray-300 hover:bg-[#22222e] rounded-lg text-sm transition-colors">
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing…' : 'Sync All'}
          </button>
          <button onClick={() => { setEditDevice(null); setEnrollModal(true) }}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors font-medium">
            <Plus size={14} /> Enroll Device
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-800/40 rounded-lg text-red-400 text-sm">
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Enrolled', value: total, sub: 'devices', color: 'text-blue-400' },
          { label: 'Compliant', value: totalCompliant, sub: `${compliancePct}% rate`, color: 'text-green-400' },
          { label: 'Non-Compliant', value: nonCompliant, sub: 'need attention', color: 'text-red-400' },
          { label: 'Active Policies', value: POLICIES.filter(p => p.enforced).length, sub: 'enforced', color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{loading ? '—' : s.value}</p>
            <p className="text-sm font-medium text-gray-300 mt-0.5">{s.label}</p>
            <p className="text-xs text-gray-600">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#1a1a1f] p-1 rounded-lg border border-[#2a2a35] w-fit">
        {[['overview', 'Overview'], ['devices', `Devices (${total})`], ['policies', 'Policies']].map(([v, l]) => (
          <button key={v} onClick={() => setActiveTab(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === v ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-4">
          {loading ? (
            <div className="col-span-2 py-12 text-center text-gray-500">Loading…</div>
          ) : platformStats.length === 0 ? (
            <div className="col-span-2 py-12 text-center text-gray-500">No devices enrolled yet.</div>
          ) : platformStats.map(p => (
            <div key={p.name} className={`card p-5 border ${PLATFORM_COLORS[p.name] || 'bg-[#16161e] border-[#2a2a35]'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{PLATFORM_ICONS[p.name] || '💾'}</span>
                  <span className="font-semibold text-white">{p.name}</span>
                </div>
                <span className="text-xs text-green-400 font-medium">
                  {Math.round((p.compliant / Math.max(p.enrolled, 1)) * 100)}% compliant
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div><p className="text-xl font-bold text-white">{p.enrolled}</p><p className="text-xs text-gray-500">Enrolled</p></div>
                <div><p className="text-xl font-bold text-green-400">{p.compliant}</p><p className="text-xs text-gray-500">Compliant</p></div>
              </div>
              <div className="mt-3 bg-[#0e0e12] rounded-full h-1.5">
                <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((p.compliant / Math.max(p.enrolled, 1)) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Devices */}
      {activeTab === 'devices' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-[#3a3a4a] bg-[#1a1a1f] text-gray-200 text-sm placeholder-gray-600"
              placeholder="Search device name or user…" />
            <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[#3a3a4a] bg-[#1a1a1f] text-gray-200 text-sm">
              <option value="">All Platforms</option>
              {PLATFORM_OPTIONS.map(p => <option key={p}>{p}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-lg border border-[#3a3a4a] bg-[#1a1a1f] text-gray-200 text-sm">
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#1a1a24]">
                  {['Device', 'Platform', 'User', 'Department', 'Status', 'Last Sync', 'OS', 'Security', 'Actions'].map(h => (
                    <th key={h} className="table-header whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500 text-sm">Loading devices…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500 text-sm">No devices found. Click <strong>Enroll Device</strong> to add one.</td></tr>
                ) : filtered.map(d => (
                  <tr key={d.id} className="table-row">
                    <td className="table-cell">
                      <p className="font-medium text-gray-200 text-sm">{d.name}</p>
                      {d.serial && <p className="text-xs text-gray-600 font-mono">{d.serial}</p>}
                    </td>
                    <td className="table-cell text-gray-400">{d.platform}</td>
                    <td className="table-cell text-gray-400 text-xs">{d.assigned_user || '—'}</td>
                    <td className="table-cell text-gray-500 text-xs">{d.department || '—'}</td>
                    <td className="table-cell">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        d.status === 'compliant' ? 'bg-green-900/30 text-green-400' :
                        d.status === 'non_compliant' ? 'bg-red-900/30 text-red-400' :
                        'bg-yellow-900/30 text-yellow-400'
                      }`}>{d.status.replace('_', ' ')}</span>
                    </td>
                    <td className="table-cell text-gray-500 text-xs whitespace-nowrap">{d.last_sync}</td>
                    <td className="table-cell text-gray-400 text-xs whitespace-nowrap">{d.os}</td>
                    <td className="table-cell">
                      <div className="flex gap-1.5">
                        <span title={d.encrypted ? 'Encrypted' : 'Not encrypted'} className={d.encrypted ? 'text-green-400' : 'text-red-400'}><Lock size={13} /></span>
                        <span title={d.passcode ? 'Passcode set' : 'No passcode'} className={d.passcode ? 'text-green-400' : 'text-red-400'}><Shield size={13} /></span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditDevice(d); setEnrollModal(true) }}
                          className="p-1.5 rounded hover:bg-[#22222e] text-gray-500 hover:text-blue-400 transition-colors" title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => removeDevice(d.id)}
                          className="p-1.5 rounded hover:bg-[#22222e] text-gray-500 hover:text-red-400 transition-colors" title="Remove">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Policies */}
      {activeTab === 'policies' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#1a1a24]">
                {['Policy Name', 'Applies To', 'Status'].map(h => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POLICIES.map((p, i) => (
                <tr key={i} className="table-row">
                  <td className="table-cell font-medium text-gray-200">{p.name}</td>
                  <td className="table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {p.platforms.map(pl => (
                        <span key={pl} className="text-xs px-1.5 py-0.5 bg-[#22222e] border border-[#3a3a4a] text-gray-400 rounded">{pl}</span>
                      ))}
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 w-fit ${
                      p.enforced ? 'bg-green-900/30 text-green-400' : 'bg-gray-800 text-gray-500'
                    }`}>
                      {p.enforced ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      {p.enforced ? 'Enforced' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {enrollModal && (
        <EnrollModal
          initial={editDevice}
          saving={saving}
          onClose={() => { setEnrollModal(false); setEditDevice(null) }}
          onSave={saveDevice}
        />
      )}
    </div>
  )
}
