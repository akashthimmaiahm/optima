import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, LogOut, Search, RefreshCw, Plus, Grid3X3, List,
  Info, HardDrive, ChevronDown, SlidersHorizontal, Users,
  UserPlus, Shield, Check, X, Eye, EyeOff,
  Loader2, Key, MapPin, Image, Hash, Server, Globe, Download,
  Monitor, Apple, Terminal, Copy, CheckCheck, Sun, Moon,
  Pencil, Trash2, AlertTriangle,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/axios'
import logoUrl from '../assets/optima-logo.png'
import { useTheme } from '../contexts/ThemeContext'

const SORT_OPTIONS = ['Property Name', 'Status', 'Assets Count']

function slugToCode(slug = '') {
  const parts = slug.split('-')
  const prefix = parts.map(p => p.slice(0, 2).toUpperCase()).join('').slice(0, 6)
  return `${prefix}${String(Math.abs(slug.length * 137) % 900 + 100)}`
}

// ── Agent Download Modal ──────────────────────────────────────────────────────
function AgentDownloadModal({ prop, onClose }) {
  const [copied, setCopied] = useState(null)
  const key = prop.property_key || ''
  const slug = prop.slug

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id); setTimeout(() => setCopied(null), 2000)
    })
  }

  const agents = [
    {
      id: 'windows',
      label: 'Windows',
      icon: Monitor,
      color: 'text-blue-500',
      ext: '.exe',
      file: `optima-agent-setup.exe`,
      downloadUrl: `/api/agents/windows/download?key=${encodeURIComponent(key)}`,
      install: `Run optima-agent-setup.exe as Administrator.\nProperty key is pre-configured — just click Install.`,
    },
    {
      id: 'linux',
      label: 'Linux / Ubuntu',
      icon: Terminal,
      color: 'text-green-500',
      ext: '.run',
      file: `optima-agent-installer.run`,
      downloadUrl: `/api/agents/linux/download?key=${encodeURIComponent(key)}`,
      install: `sudo bash optima-agent-installer.run`,
    },
    {
      id: 'mac',
      label: 'macOS',
      icon: Apple,
      color: 'text-gray-500 dark:text-gray-300',
      ext: '.command',
      file: `optima-agent-installer.command`,
      downloadUrl: `/api/agents/mac/download?key=${encodeURIComponent(key)}`,
      install: `sudo bash optima-agent-installer.command`,
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#222] rounded-2xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#1a1a1a]">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Download size={15} className="text-blue-500" /> Download Agent
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">{prop.name} — installs HAM/SAM discovery agent</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Property info — key is embedded, not shown */}
          <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 rounded-xl p-3">
            <p className="text-[10px] text-green-700 dark:text-green-400 flex items-center gap-1">
              <CheckCheck size={10} /> Property key is securely embedded in the agent installer. No manual configuration needed.
            </p>
          </div>

          {/* Agent downloads */}
          {agents.map(agent => (
            <div key={agent.id} className="bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <agent.icon size={15} className={agent.color} />
                  <span className="text-xs font-semibold text-gray-900 dark:text-white">{agent.label}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{agent.ext}</span>
                </div>
                <a
                  href={agent.downloadUrl}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-blue-50 dark:bg-blue-600/20 hover:bg-blue-100 dark:hover:bg-blue-600/30 border border-blue-200 dark:border-blue-600/40 text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
                  download={agent.file}
                >
                  <Download size={11} /> Download
                </a>
              </div>
              <div className="relative">
                <pre className="text-[10px] text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-black rounded px-3 py-2 overflow-x-auto font-mono leading-relaxed">{agent.install}</pre>
                <button onClick={() => copyText(agent.install, agent.id)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
                  {copied === agent.id ? <CheckCheck size={11} className="text-green-500" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
          ))}

          <p className="text-[10px] text-gray-400 dark:text-gray-700">
            Standalone executable — no dependencies required. Downloads, installs as a system service, and runs inventory scans automatically.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Property Card ────────────────────────────────────────────────────────────
function PropertyCard({ prop, onSelect, selecting, online, isSuperAdmin, onEdit, onDelete }) {
  const code = prop.vdms_id || slugToCode(prop.slug)
  const loading = selecting === prop.id
  const isOffline = online === false   // null = still checking, false = confirmed offline
  const isChecking = online === null
  const [showAgent, setShowAgent] = useState(false)

  return (
    <>
      <div className={`bg-white dark:bg-[#111] border rounded-xl overflow-hidden transition-all duration-150 ${
        isOffline
          ? 'border-red-200 dark:border-red-900/40 opacity-60 cursor-not-allowed'
          : 'border-gray-200 dark:border-[#222] hover:border-gray-300 dark:hover:border-[#333]'
      }`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-gray-600 dark:text-gray-300 tracking-widest">{code}</span>
            <Info size={13} className="text-blue-500" />
          </div>
          <div className="flex items-center gap-1">
            {isChecking
              ? <span className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" title="Checking…" />
              : isOffline
                ? <span className="w-2.5 h-2.5 rounded-full bg-red-500" title="Server offline" />
                : <span className="w-2.5 h-2.5 rounded-full bg-green-500" title="Online" />
            }
            {isOffline && <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">Offline</span>}
            {isSuperAdmin && (
              <div className="flex items-center gap-0.5 ml-1">
                <button type="button" onClick={e => { e.stopPropagation(); onEdit() }} title="Edit"
                  className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                  <Pencil size={11} />
                </button>
                <button type="button" onClick={e => { e.stopPropagation(); onDelete() }} title="Delete"
                  className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-6 px-4 gap-3">
          <div className={`w-14 h-14 rounded-full border flex items-center justify-center overflow-hidden ${
            isOffline
              ? 'bg-gray-100 dark:bg-[#1a1a1a] border-gray-200 dark:border-[#2a2a2a]'
              : 'bg-gray-100 dark:bg-[#1a1a1a] border-gray-200 dark:border-[#2a2a2a]'
          }`}>
            {prop.logo_url
              ? <img src={prop.logo_url} alt={prop.name} className="w-full h-full object-cover" onError={e => { e.target.style.display='none' }} />
              : <Building2 size={24} className={isOffline ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'} />}
          </div>
          <p className={`text-sm font-semibold text-center leading-tight ${isOffline ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'}`}>{prop.name}</p>
          {prop.domain && <p className="text-xs text-gray-500 dark:text-gray-600 font-mono">{prop.domain}</p>}
        </div>
        <div className="flex items-center justify-between px-3 py-3 bg-gray-50 dark:bg-[#0d0d0d] border-t border-gray-100 dark:border-[#1e1e1e] gap-2">
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <HardDrive size={11} />
            <span className="text-gray-900 dark:text-white font-semibold">{prop.asset_count ?? '—'}</span>
          </div>
          <button onClick={() => setShowAgent(true)}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-gray-100 dark:bg-[#1a1a1a] hover:bg-gray-200 dark:hover:bg-[#222] border border-gray-200 dark:border-[#2a2a2a] text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white rounded-lg transition-colors">
            <Download size={11} /> Agent
          </button>
          <button
            onClick={() => !isOffline && onSelect(prop)}
            disabled={loading || isOffline || isChecking}
            title={isOffline ? 'Property server is offline' : ''}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
              isOffline
                ? 'bg-red-100 dark:bg-red-900/20 text-red-400 dark:text-red-600 cursor-not-allowed border border-red-200 dark:border-red-800/40'
                : isChecking
                  ? 'bg-gray-200 dark:bg-[#222] text-gray-400 cursor-wait'
                  : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60'
            }`}
          >
            {loading
              ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />…</>
              : isOffline
                ? 'Offline'
                : isChecking
                  ? '…'
                  : 'Select'}
          </button>
        </div>
      </div>
      {showAgent && <AgentDownloadModal prop={prop} onClose={() => setShowAgent(false)} />}
    </>
  )
}

// ── Users View ───────────────────────────────────────────────────────────────
function UsersView() {
  const [users, setUsers]         = useState([])
  const [properties, setProps]    = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('list')
  const [search, setSearch]       = useState('')
  const [showAdd, setShowAdd]     = useState(false)
  const [addForm, setAddForm]     = useState({ name: '', email: '', password: '', global_role: 'user', property_ids: [], sso_only: false })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError]   = useState('')
  const [showPwd, setShowPwd]     = useState(false)
  const [grantLoading, setGrantLoading] = useState('')
  const [editUser, setEditUser]   = useState(null)
  const [editForm, setEditForm]   = useState({ name: '', email: '', global_role: 'user', is_active: 1 })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [uRes, pRes] = await Promise.all([
        api.get('/portal/users'),
        api.get('/portal/registry'),
      ])
      setUsers(uRes.data.data || [])
      setProps(pRes.data.data || [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return users
    const q = search.toLowerCase()
    return users.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
  }, [users, search])

  const hasAccess = (user, propId) => user.properties?.some(p => p.id === propId)

  const toggleAccess = async (userId, propId, currently) => {
    const key = `${userId}-${propId}`
    setGrantLoading(key)
    try {
      if (currently) {
        await api.delete(`/portal/users/${userId}/revoke/${propId}`)
      } else {
        await api.post(`/portal/users/${userId}/grant`, { property_id: propId, role: 'user' })
      }
      await load()
    } catch { /* ignore */ }
    setGrantLoading('')
  }

  const submitAdd = async (e) => {
    e.preventDefault()
    setAddLoading(true)
    setAddError('')
    try {
      const { sso_only, ...payload } = addForm
      if (sso_only) {
        // SSO user — backend handles missing name/password
        delete payload.name
        delete payload.password
      }
      await api.post('/portal/users', payload)
      setAddForm({ name: '', email: '', password: '', global_role: 'user', property_ids: [], sso_only: false })
      setShowAdd(false)
      await load()
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to create user')
    }
    setAddLoading(false)
  }

  const openEdit = (u) => {
    setEditUser(u)
    setEditForm({ name: u.name, email: u.email, global_role: u.global_role, is_active: u.is_active })
    setEditError('')
  }

  const submitEdit = async (e) => {
    e.preventDefault()
    setEditLoading(true)
    setEditError('')
    try {
      await api.put(`/portal/users/${editUser.id}`, editForm)
      setEditUser(null)
      await load()
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update user')
    }
    setEditLoading(false)
  }

  const confirmDeactivate = async (userId) => {
    try {
      await api.delete(`/portal/users/${userId}`)
      setDeleteConfirm(null)
      await load()
    } catch { /* ignore */ }
  }

  const confirmDeletePermanent = async (userId) => {
    try {
      await api.delete(`/portal/users/${userId}/permanent`)
      setDeleteConfirm(null)
      await load()
    } catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-gray-200 dark:border-[#1a1a1a]">
        {[
          { key: 'list', label: 'User List', icon: Users },
          { key: 'auth', label: 'User Authorization', icon: Key },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === key ? 'bg-blue-600/15 text-blue-500 dark:text-blue-400' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#111]'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={load} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors p-1">
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : tab === 'list' ? (
          /* ── User List ── */
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2 w-64">
                <Search size={13} className="text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search users…"
                  className="flex-1 bg-transparent text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none"
                />
              </div>
              <button
                onClick={() => setShowAdd(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <UserPlus size={13} />
                Add User
              </button>
            </div>

            {/* Add user form */}
            {showAdd && (
              <form onSubmit={submitAdd} className="mb-4 p-4 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#222] rounded-xl space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Create New User</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-[10px] text-gray-500">SSO Only</span>
                    <button type="button" onClick={() => setAddForm(f => ({ ...f, sso_only: !f.sso_only }))}
                      className={`relative w-8 h-4 rounded-full transition-colors ${addForm.sso_only ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
                      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${addForm.sso_only ? 'translate-x-4.5 left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </label>
                </div>
                {addForm.sso_only && (
                  <p className="text-[10px] text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-lg px-3 py-1.5">
                    SSO user — only email and role required. User will login via Microsoft or Sclera SSO.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {!addForm.sso_only && (
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">Name</label>
                      <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                        required={!addForm.sso_only} placeholder="Full Name"
                        className="w-full bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-500" />
                    </div>
                  )}
                  <div className={addForm.sso_only ? 'col-span-2' : ''}>
                    <label className="text-[10px] text-gray-500 block mb-1">Email {addForm.sso_only && <span className="text-blue-500">(must match SSO provider email)</span>}</label>
                    <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                      required placeholder={addForm.sso_only ? "user@company.com (Microsoft/Sclera email)" : "user@example.com"}
                      className="w-full bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-500" />
                  </div>
                  {!addForm.sso_only && (
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">Password</label>
                      <div className="relative">
                        <input type={showPwd ? 'text' : 'password'} value={addForm.password}
                          onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))}
                          required placeholder="Password"
                          className="w-full bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2 pr-8 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-500" />
                        <button type="button" onClick={() => setShowPwd(v => !v)}
                          className="absolute right-2 top-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                          {showPwd ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1">Role</label>
                    <select value={addForm.global_role} onChange={e => setAddForm(f => ({ ...f, global_role: e.target.value }))}
                      className="w-full bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500">
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="it_admin">IT Admin</option>
                      <option value="it_manager">IT Manager</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                </div>
                {/* Property assignment checkboxes */}
                {properties.length > 0 && (
                  <div>
                    <label className="text-[10px] text-gray-500 block mb-1.5">Property Access</label>
                    <div className="flex flex-wrap gap-2">
                      {properties.map(p => {
                        const checked = addForm.property_ids.includes(p.id)
                        return (
                          <button type="button" key={p.id}
                            onClick={() => setAddForm(f => ({
                              ...f,
                              property_ids: checked ? f.property_ids.filter(id => id !== p.id) : [...f.property_ids, p.id]
                            }))}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                              checked ? 'bg-blue-50 dark:bg-blue-600/20 border-blue-300 dark:border-blue-600/50 text-blue-600 dark:text-blue-400' : 'bg-white dark:bg-[#111] border-gray-200 dark:border-[#222] text-gray-500 hover:border-gray-300 dark:hover:border-[#333]'
                            }`}
                          >
                            {checked && <Check size={10} />}
                            {p.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {addError && <p className="text-xs text-red-500 dark:text-red-400">{addError}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={addLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium disabled:opacity-60">
                    {addLoading ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                    Create User
                  </button>
                  <button type="button" onClick={() => setShowAdd(false)}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-[#222] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg text-xs transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {filtered.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-700/40 flex items-center justify-center flex-shrink-0 text-xs font-bold text-blue-600 dark:text-blue-400">
                    {(u.name || u.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">{u.name}</p>
                    <p className="text-[10px] text-gray-500">{u.email}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                    u.global_role === 'super_admin' ? 'text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-900/20'
                    : u.global_role === 'admin' ? 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30'
                  }`}>{u.global_role}</span>
                  <span className={`flex items-center gap-1 text-[10px] ${u.is_active ? 'text-green-500' : 'text-red-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {u.properties?.length > 0 && (
                    <div className="flex gap-1">
                      {u.properties.slice(0, 3).map(p => (
                        <span key={p.id} className="text-[9px] px-1.5 py-0.5 bg-gray-100 dark:bg-[#1a1a1a] text-gray-500 rounded border border-gray-200 dark:border-[#2a2a2a]">{p.name} <span className="text-gray-400">({p.role})</span></span>
                      ))}
                      {u.properties.length > 3 && <span className="text-[9px] text-gray-400 dark:text-gray-600">+{u.properties.length - 3}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-1 ml-2">
                    <button onClick={() => openEdit(u)} title="Edit user"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setDeleteConfirm(u)} title="Deactivate user"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-gray-400 dark:text-gray-600 py-12">No users found.</p>
              )}
            </div>

            {/* Edit User Modal */}
            {editUser && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditUser(null)}>
                <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-[#2a2a2a] rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Edit User</h3>
                  <form onSubmit={submitEdit} className="space-y-3">
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">Name</label>
                      <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        required className="w-full bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 block mb-1">Email</label>
                      <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                        required className="w-full bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Global Role</label>
                        <select value={editForm.global_role} onChange={e => setEditForm(f => ({ ...f, global_role: e.target.value }))}
                          className="w-full bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500">
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                          <option value="it_admin">IT Admin</option>
                          <option value="it_manager">IT Manager</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1">Status</label>
                        <select value={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: parseInt(e.target.value) }))}
                          className="w-full bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white outline-none focus:border-blue-500">
                          <option value={1}>Active</option>
                          <option value={0}>Inactive</option>
                        </select>
                      </div>
                    </div>
                    {/* Property assignments */}
                    {properties.length > 0 && (
                      <div>
                        <label className="text-[10px] text-gray-500 block mb-1.5">Property Access</label>
                        <div className="flex flex-wrap gap-2">
                          {properties.map(p => {
                            const assignment = editUser.properties?.find(up => up.id === p.id)
                            return (
                              <button type="button" key={p.id}
                                onClick={async () => {
                                  if (assignment) {
                                    await api.delete(`/portal/users/${editUser.id}/revoke/${p.id}`)
                                  } else {
                                    await api.post(`/portal/users/${editUser.id}/grant`, { property_id: p.id, role: editForm.global_role || 'user' })
                                  }
                                  const uRes = await api.get('/portal/users')
                                  setUsers(uRes.data.data || [])
                                  const updated = (uRes.data.data || []).find(u => u.id === editUser.id)
                                  if (updated) setEditUser(updated)
                                }}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                                  assignment ? 'bg-blue-50 dark:bg-blue-600/20 border-blue-300 dark:border-blue-600/50 text-blue-600 dark:text-blue-400' : 'bg-white dark:bg-[#0d0d0d] border-gray-200 dark:border-[#222] text-gray-500 hover:border-gray-300 dark:hover:border-[#333]'
                                }`}
                              >
                                {assignment && <Check size={10} />}
                                {p.name}
                                {assignment && <span className="text-[9px] text-gray-400 ml-1">({assignment.role})</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {editError && <p className="text-xs text-red-500">{editError}</p>}
                    <div className="flex gap-2 pt-2">
                      <button type="submit" disabled={editLoading}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium disabled:opacity-60">
                        {editLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Save Changes
                      </button>
                      <button type="button" onClick={() => setEditUser(null)}
                        className="px-4 py-2 bg-gray-100 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#222] text-gray-600 dark:text-gray-400 rounded-lg text-xs hover:text-gray-900 dark:hover:text-white transition-colors">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Delete / Deactivate Confirmation Modal */}
            {deleteConfirm && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
                <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-[#2a2a2a] rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <AlertTriangle size={18} className="text-red-500" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">Remove User</h3>
                      <p className="text-[11px] text-gray-500">{deleteConfirm.name} ({deleteConfirm.email})</p>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <button onClick={() => confirmDeactivate(deleteConfirm.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors text-left">
                      <EyeOff size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Deactivate</p>
                        <p className="text-[10px] text-amber-600/70 dark:text-amber-500/60">Prevent login but keep user record. Can be reactivated later.</p>
                      </div>
                    </button>
                    <button onClick={() => confirmDeletePermanent(deleteConfirm.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-left">
                      <Trash2 size={14} className="text-red-600 dark:text-red-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400">Delete Permanently</p>
                        <p className="text-[10px] text-red-600/70 dark:text-red-500/60">Remove user and all property assignments. This cannot be undone.</p>
                      </div>
                    </button>
                  </div>
                  <button onClick={() => setDeleteConfirm(null)}
                    className="w-full px-4 py-2 bg-gray-100 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#222] text-gray-600 dark:text-gray-400 rounded-lg text-xs hover:text-gray-900 dark:hover:text-white transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── User Authorization ── */
          <>
            <div className="mb-4">
              <p className="text-xs text-gray-500">Manage which users have access to each property.</p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1e1e1e]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#0d0d0d] border-b border-gray-200 dark:border-[#1e1e1e]">
                    <th className="text-left px-4 py-3 text-gray-500 font-medium w-48">User</th>
                    {properties.map(p => (
                      <th key={p.id} className="text-center px-3 py-3 text-gray-500 font-medium whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[10px] font-mono text-gray-400 dark:text-gray-600">{slugToCode(p.slug)}</span>
                          <span className="text-gray-800 dark:text-white">{p.name}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id} className={`border-b border-gray-100 dark:border-[#1a1a1a] ${i % 2 === 0 ? 'bg-white dark:bg-[#080808]' : 'bg-gray-50 dark:bg-[#0a0a0a]'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-700/30 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">
                            {(u.name || u.email)[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-gray-800 dark:text-white truncate">{u.name}</p>
                            <p className="text-[9px] text-gray-400 dark:text-gray-600 truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      {properties.map(p => {
                        const has = hasAccess(u, p.id)
                        const key = `${u.id}-${p.id}`
                        const busy = grantLoading === key
                        if (u.global_role === 'super_admin') {
                          return (
                            <td key={p.id} className="text-center px-3 py-3">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30">
                                <Shield size={10} className="text-purple-500 dark:text-purple-400" />
                              </span>
                            </td>
                          )
                        }
                        return (
                          <td key={p.id} className="text-center px-3 py-3">
                            <button
                              onClick={() => toggleAccess(u.id, p.id, has)}
                              disabled={busy}
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                                busy ? 'opacity-50 cursor-wait' :
                                has ? 'bg-green-100 dark:bg-green-900/30 hover:bg-red-100 dark:hover:bg-red-900/30 group'
                                    : 'bg-gray-100 dark:bg-[#1a1a1a] hover:bg-green-50 dark:hover:bg-green-900/20 border border-gray-200 dark:border-[#2a2a2a]'
                              }`}
                              title={has ? 'Click to revoke access' : 'Click to grant access'}
                            >
                              {busy
                                ? <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                                : has
                                  ? <Check size={10} className="text-green-500 dark:text-green-400" />
                                  : <X size={10} className="text-gray-400 dark:text-gray-600" />
                              }
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={properties.length + 1} className="text-center py-12 text-gray-400 dark:text-gray-600">No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-700 mt-3">
              <span className="inline-flex items-center gap-1"><Check size={9} className="text-green-500" /> Green</span> = has access &nbsp;·&nbsp;
              <span className="inline-flex items-center gap-1"><Shield size={9} className="text-purple-500" /> Purple</span> = super admin (all properties) &nbsp;·&nbsp;
              Click a cell to toggle access.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Add Property Modal ───────────────────────────────────────────────────────
const EMPTY_FORM = { name: '', vdms_id: '', address: '', logo_url: '', slug: '', ec2_url: '', domain: '', plan: 'standard', description: '' }

const INPUT_CLS = "w-full bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-blue-500 transition-colors"

// Defined OUTSIDE AddPropertyModal so React doesn't remount it on every keystroke
function PropField({ label, icon: Icon, value, onChange, type = 'text', placeholder = '', required = false, hint = '' }) {
  return (
    <div>
      <label className="text-[10px] text-gray-500 flex items-center gap-1 mb-1">
        {Icon && <Icon size={10} />} {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={INPUT_CLS}
      />
      {hint && <p className="text-[9px] text-gray-400 dark:text-gray-600 mt-0.5">{hint}</p>}
    </div>
  )
}

function AddPropertyModal({ onClose, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdKey, setCreatedKey] = useState(null)   // set after successful creation
  const [keyCopied, setKeyCopied] = useState(false)
  const logoInputRef = useRef(null)

  const set = (field, value) => {
    setForm(f => {
      const next = { ...f, [field]: value }
      if (field === 'name') next.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      return next
    })
  }

  const handleLogoFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => set('logo_url', ev.target.result)
    reader.readAsDataURL(file)
  }

  const copyKey = () => {
    navigator.clipboard.writeText(createdKey)
    setKeyCopied(true)
    setTimeout(() => setKeyCopied(false), 2000)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.slug || !form.ec2_url) { setError('Name, slug and server URL are required.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/portal/registry', form)
      onSaved()
      setCreatedKey(res.data.property_key)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create property')
    }
    setLoading(false)
  }

  // ── Key reveal screen shown after successful creation ──
  if (createdKey) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#222] rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#1a1a1a]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-green-50 dark:bg-green-600/20 border border-green-200 dark:border-green-600/40 rounded-lg flex items-center justify-center">
              <Key size={15} className="text-green-500 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Property Created!</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-600">Save this key — it won't be shown again</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-6 space-y-4">
          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-xl flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Copy this key now and keep it safe. You will need it when starting the property server instance. It cannot be retrieved later.
            </p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 mb-2">Property Key</p>
            <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#2a2a2a] rounded-xl">
              <code className="flex-1 text-xs font-mono text-blue-600 dark:text-blue-400 break-all">{createdKey}</code>
              <button type="button" onClick={copyKey}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex-shrink-0">
                {keyCopied ? <><CheckCheck size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
              </button>
            </div>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-xl">
            <p className="text-[10px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">How to use</p>
            <ol className="text-[10px] text-gray-500 dark:text-gray-400 space-y-1 list-decimal list-inside">
              <li>SSH into your property EC2 instance</li>
              <li>Clone the repo and run <code className="font-mono text-blue-500">node property-server.js</code></li>
              <li>Enter this key when prompted — the server will register and go online</li>
            </ol>
          </div>
          <button type="button" onClick={onClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#222] rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#1a1a1a]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-600/40 rounded-lg flex items-center justify-center">
              <Building2 size={15} className="text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Add Property</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-600">Register a new property in the portal</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Logo upload */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-[#111] border-2 border-dashed border-gray-200 dark:border-[#2a2a2a] flex items-center justify-center flex-shrink-0 overflow-hidden">
              {form.logo_url
                ? <img src={form.logo_url} alt="logo" className="w-full h-full object-cover rounded-xl" />
                : <Building2 size={22} className="text-gray-300 dark:text-gray-600" />}
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-500 flex items-center gap-1 mb-2"><Image size={10} /> Property Logo</p>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
              <button type="button" onClick={() => logoInputRef.current.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 dark:bg-[#1a1a1a] hover:bg-gray-200 dark:hover:bg-[#222] border border-gray-200 dark:border-[#2a2a2a] text-gray-600 dark:text-gray-400 rounded-lg transition-colors">
                <Download size={11} /> Browse & Upload
              </button>
              {form.logo_url && (
                <button type="button" onClick={() => set('logo_url', '')}
                  className="ml-2 text-[10px] text-red-400 hover:text-red-500 transition-colors">
                  Remove
                </button>
              )}
              <p className="text-[9px] text-gray-400 dark:text-gray-600 mt-1">PNG, JPG or SVG · max 2MB</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <PropField label="Property Name" icon={Building2} value={form.name} onChange={v => set('name', v)} placeholder="Acme Corporation" required />
            </div>
            <PropField label="VDMS ID" icon={Hash} value={form.vdms_id} onChange={v => set('vdms_id', v)} placeholder="VDMS8701" hint="Unique identifier for this property" />
            <div>
              <label className="text-[10px] text-gray-500 flex items-center gap-1 mb-1">
                <Hash size={10} /> Slug <span className="text-red-500">*</span>
              </label>
              <input
                value={form.slug}
                onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required placeholder="acme-corp"
                className={`${INPUT_CLS} font-mono`}
              />
              <p className="text-[9px] text-gray-400 dark:text-gray-600 mt-0.5">Auto-generated from name</p>
            </div>
            <div className="col-span-2">
              <PropField label="Address" icon={MapPin} value={form.address} onChange={v => set('address', v)} placeholder="123 Main St, San Francisco, CA 94105" />
            </div>
            <div className="col-span-2">
              <PropField label="Server URL" icon={Server} value={form.ec2_url} onChange={v => set('ec2_url', v)} placeholder="http://10.0.1.50:5000" required hint="EC2 URL for this property's backend" />
            </div>
            <PropField label="Domain" icon={Globe} value={form.domain} onChange={v => set('domain', v)} placeholder="acme.optima.sclera.com" />
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Plan</label>
              <select value={form.plan} onChange={e => set('plan', e.target.value)} className={INPUT_CLS}>
                <option value="standard">Standard</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-gray-500 block mb-1">Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2}
                placeholder="Brief description of this property…"
                className={`${INPUT_CLS} resize-none`} />
            </div>
          </div>

          {error && <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-60">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {loading ? 'Creating…' : 'Create Property'}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-[#222] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg text-xs transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit Property Modal ───────────────────────────────────────────────────────
function EditPropertyModal({ prop, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:        prop.name        || '',
    vdms_id:     prop.vdms_id     || '',
    address:     prop.address     || '',
    logo_url:    prop.logo_url    || '',
    slug:        prop.slug        || '',
    ec2_url:     prop.ec2_url     || '',
    domain:      prop.domain      || '',
    plan:        prop.plan        || 'standard',
    description: prop.description || '',
    status:      prop.status      || 'active',
  })
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const logoInputRef            = useRef(null)

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleLogoFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => set('logo_url', ev.target.result)
    reader.readAsDataURL(file)
  }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await api.put(`/portal/registry/${prop.id}`, form)
      onSaved(); onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update property')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#222] rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#1a1a1a]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-600/40 rounded-lg flex items-center justify-center">
              <Pencil size={14} className="text-blue-500 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Edit Property</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-600">{prop.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-[#111] border-2 border-dashed border-gray-200 dark:border-[#2a2a2a] flex items-center justify-center flex-shrink-0 overflow-hidden">
              {form.logo_url ? <img src={form.logo_url} alt="logo" className="w-full h-full object-cover rounded-xl" /> : <Building2 size={22} className="text-gray-300 dark:text-gray-600" />}
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-gray-500 flex items-center gap-1 mb-2"><Image size={10} /> Property Logo</p>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoFile} className="hidden" />
              <button type="button" onClick={() => logoInputRef.current.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 dark:bg-[#1a1a1a] hover:bg-gray-200 dark:hover:bg-[#222] border border-gray-200 dark:border-[#2a2a2a] text-gray-600 dark:text-gray-400 rounded-lg transition-colors">
                <Download size={11} /> Browse & Upload
              </button>
              {form.logo_url && <button type="button" onClick={() => set('logo_url', '')} className="ml-2 text-[10px] text-red-400 hover:text-red-500 transition-colors">Remove</button>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><PropField label="Property Name" icon={Building2} value={form.name} onChange={v => set('name', v)} placeholder="Acme Corporation" required /></div>
            <PropField label="VDMS ID" icon={Hash} value={form.vdms_id} onChange={v => set('vdms_id', v)} placeholder="VDMS8701" />
            <div>
              <label className="text-[10px] text-gray-500 flex items-center gap-1 mb-1"><Hash size={10} /> Slug <span className="text-red-500">*</span></label>
              <input value={form.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} required placeholder="acme-corp" className={`${INPUT_CLS} font-mono`} />
            </div>
            <div className="col-span-2"><PropField label="Address" icon={MapPin} value={form.address} onChange={v => set('address', v)} placeholder="123 Main St…" /></div>
            <div className="col-span-2"><PropField label="Server URL" icon={Server} value={form.ec2_url} onChange={v => set('ec2_url', v)} placeholder="http://10.0.1.50:5000" required hint="EC2 URL for health checks and proxying" /></div>
            <PropField label="Domain" icon={Globe} value={form.domain} onChange={v => set('domain', v)} placeholder="acme.optima.sclera.com" />
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Plan</label>
              <select value={form.plan} onChange={e => set('plan', e.target.value)} className={INPUT_CLS}>
                <option value="standard">Standard</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={INPUT_CLS}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-gray-500 block mb-1">Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Brief description…" className={`${INPUT_CLS} resize-none`} />
            </div>
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-60">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-[#222] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg text-xs transition-colors">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteConfirmModal({ prop, onClose, onDeleted }) {
  const [loading, setLoading] = useState(false)

  const confirm = async () => {
    setLoading(true)
    try {
      await api.delete(`/portal/registry/${prop.id}`)
      onDeleted(); onClose()
    } catch { /* ignore */ }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-[#222] rounded-2xl w-full max-w-sm mx-4 shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Delete Property</p>
            <p className="text-xs text-gray-500 mt-0.5">This will archive <span className="font-medium text-gray-700 dark:text-gray-300">{prop.name}</span></p>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-lg p-3">
          The property will be archived and removed from the portal. The property server instance will continue running but won't appear in the property list.
        </p>
        <div className="flex gap-2">
          <button onClick={confirm} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-60">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {loading ? 'Deleting…' : 'Delete Property'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-[#222] text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg text-xs transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Main PropertySelector ────────────────────────────────────────────────────
export default function PropertySelector() {
  const { user, accessibleProperties, setAccessibleProperties, setSelectedProperty, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [view, setView]         = useState('properties')
  const [selecting, setSelecting] = useState(null)
  const [search, setSearch]     = useState('')
  const [sortBy, setSortBy]     = useState('Property Name')
  const [showSort, setShowSort] = useState(false)
  const [viewMode, setViewMode] = useState('grid')
  const [loadingProps, setLoadingProps] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editProp, setEditProp]         = useState(null)
  const [deleteProp, setDeleteProp]     = useState(null)
  // null = not yet checked, true = online, false = offline
  const [healthMap, setHealthMap] = useState({})
  const wsRef = useRef(null)

  const fetchHealth = async () => {
    try {
      const res = await api.get('/portal/properties/health')
      setHealthMap(res.data.health || {})
    } catch { /* health check failed silently */ }
  }

  // WebSocket for real-time health status
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${proto}://${window.location.host}/ws?role=frontend`
    let ws = null
    let reconnectTimer = null

    function connect() {
      try { ws = new WebSocket(wsUrl) } catch { return }
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if (msg.type === 'status' && msg.health) {
            setHealthMap(prev => {
              const next = { ...prev }
              for (const id of Object.keys(next)) {
                next[id] = !!msg.health[id]
              }
              return next
            })
          }
        } catch {}
      }
      ws.onclose = () => { reconnectTimer = setTimeout(connect, 5000) }
      ws.onerror = () => { ws.close() }
      wsRef.current = ws
    }
    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws && ws.readyState <= 1) ws.close()
    }
  }, [])

  const fetchProperties = async () => {
    setLoadingProps(true)
    // Mark all as "checking" while we load
    setHealthMap({})
    try {
      const res = await api.get('/portal/properties')
      const props = res.data.data || []
      setAccessibleProperties(props)
      localStorage.setItem('optima_properties', JSON.stringify(props))
      // Seed null (checking) for every property, then fetch real status
      setHealthMap(Object.fromEntries(props.map(p => [p.id, null])))
      fetchHealth()
    } catch { /* fall back to cached */ }
    setLoadingProps(false)
  }

  useEffect(() => { fetchProperties() }, [])

  const select = async (property) => {
    setSelecting(property.id)
    setSelectedProperty(property)
    await new Promise(r => setTimeout(r, 300))
    navigate('/')
  }

  const filtered = useMemo(() => {
    let list = [...accessibleProperties]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
    }
    if (sortBy === 'Property Name') list.sort((a, b) => a.name.localeCompare(b.name))
    else if (sortBy === 'Status') list.sort((a, b) => (a.status || '').localeCompare(b.status || ''))
    else if (sortBy === 'Assets Count') list.sort((a, b) => (b.asset_count ?? 0) - (a.asset_count ?? 0))
    return list
  }, [accessibleProperties, search, sortBy])

  const isSuperAdmin = user?.global_role === 'super_admin' || user?.role === 'super_admin'

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-white overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="w-52 flex-shrink-0 bg-white dark:bg-[#0a0a0a] border-r border-gray-200 dark:border-[#1a1a1a] flex flex-col">
        {/* Logo */}
        <div className="flex items-center px-4 py-4 border-b border-gray-200 dark:border-[#1a1a1a]">
          <img
            src={logoUrl}
            alt="Optima"
            className="h-7 w-auto object-contain"
            style={theme === 'dark' ? { filter: 'brightness(0) invert(1)' } : {}}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3">
          <button
            onClick={() => setView('properties')}
            className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-xs transition-colors ${
              view === 'properties'
                ? 'bg-blue-50 dark:bg-blue-600/15 text-blue-600 dark:text-blue-400 border-r-2 border-blue-500'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#111]'
            }`}
          >
            <Building2 size={14} className={view === 'properties' ? 'text-blue-500 dark:text-blue-400' : ''} />
            <span className={view === 'properties' ? 'font-medium' : ''}>Property List</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setView('users')}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-xs transition-colors ${
                view === 'users'
                  ? 'bg-blue-50 dark:bg-blue-600/15 text-blue-600 dark:text-blue-400 border-r-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#111]'
              }`}
            >
              <Users size={14} className={view === 'users' ? 'text-blue-500 dark:text-blue-400' : ''} />
              <span className={view === 'users' ? 'font-medium' : ''}>Users</span>
            </button>
          )}
        </nav>

        {/* User */}
        <div className="border-t border-gray-200 dark:border-[#1a1a1a] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-xs font-bold text-white">
              {(user?.name || user?.email || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{user?.name || 'User'}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-600 truncate">{user?.global_role || user?.role || 'user'}</p>
            </div>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {view === 'users' ? (
          <UsersView />
        ) : (
          <>
            {/* Top bar */}
            <div className="flex items-center gap-3 px-6 py-3.5 border-b border-gray-200 dark:border-[#1a1a1a] bg-white dark:bg-[#050505]">
              <div className="flex items-center gap-2 flex-1 max-w-xs bg-gray-50 dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-lg px-3 py-2">
                <Search size={13} className="text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search properties…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 outline-none"
                />
              </div>
              <div className="flex-1" />
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1e1e28] hover:text-gray-800 dark:hover:text-gray-300 transition-colors"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              {/* Sort */}
              <div className="relative">
                <button
                  onClick={() => setShowSort(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-[#333] transition-colors"
                >
                  <SlidersHorizontal size={12} />
                  Sort By: <span className="text-gray-900 dark:text-white ml-0.5">{sortBy}</span>
                  <ChevronDown size={11} />
                </button>
                {showSort && (
                  <div className="absolute right-0 top-10 bg-white dark:bg-[#111] border border-gray-200 dark:border-[#222] rounded-xl shadow-2xl z-50 w-44 py-1">
                    {SORT_OPTIONS.map(opt => (
                      <button key={opt} onClick={() => { setSortBy(opt); setShowSort(false) }}
                        className={`w-full text-left px-4 py-2.5 text-xs transition-colors ${
                          opt === sortBy ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-600/10' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-[#1a1a1a]'
                        }`}
                      >{opt}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Page header */}
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <h1 className="text-base font-bold text-gray-900 dark:text-white">Property List</h1>
                <button onClick={fetchProperties} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors" title="Refresh">
                  <RefreshCw size={14} className={loadingProps ? 'animate-spin' : ''} />
                </button>
                <span className="text-xs text-gray-500 bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-[#1e1e1e] px-2 py-0.5 rounded-full">{filtered.length}</span>
              </div>
              <div className="flex items-center gap-2">
                {isSuperAdmin && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
                  >
                    <Plus size={13} />
                    Add Property
                  </button>
                )}
                <div className="flex items-center border border-gray-200 dark:border-[#222] rounded-lg overflow-hidden">
                  {[{ mode: 'grid', Icon: Grid3X3 }, { mode: 'list', Icon: List }].map(({ mode, Icon }) => (
                    <button key={mode} onClick={() => setViewMode(mode)}
                      className={`p-2 transition-colors ${viewMode === mode ? 'bg-gray-100 dark:bg-[#1a1a1a] text-gray-900 dark:text-white' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {loadingProps && filtered.length === 0 ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 size={20} className="animate-spin text-gray-400" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Building2 size={40} className="mb-3 opacity-20" />
                  <p className="text-sm">{search ? 'No properties match your search.' : 'No properties assigned.'}</p>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {filtered.map(prop => (
                    <PropertyCard key={prop.id} prop={prop} onSelect={select} selecting={selecting} online={healthMap[prop.id] ?? null} isSuperAdmin={isSuperAdmin} onEdit={() => setEditProp(prop)} onDelete={() => setDeleteProp(prop)} />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(prop => {
                    const code = prop.vdms_id || slugToCode(prop.slug)
                    const loading = selecting === prop.id
                    const online = healthMap[prop.id] ?? null
                    const isOffline = online === false
                    const isChecking = online === null
                    return (
                      <div key={prop.id} className={`flex items-center gap-4 px-5 py-4 border rounded-xl transition-all ${
                        isOffline
                          ? 'bg-gray-50 dark:bg-[#0d0d0d] border-red-200 dark:border-red-900/40 opacity-60'
                          : 'bg-white dark:bg-[#0d0d0d] border-gray-200 dark:border-[#1e1e1e] hover:border-gray-300 dark:hover:border-[#2a2a2a]'
                      }`}>
                        <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] flex items-center justify-center flex-shrink-0">
                          <Building2 size={16} className={isOffline ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold ${isOffline ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-white'}`}>{prop.name}</span>
                            <span className="text-[10px] font-mono text-gray-400 dark:text-gray-600">{code}</span>
                            {isChecking
                              ? <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" />
                              : isOffline
                                ? <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">Offline</span></span>
                                : <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            }
                          </div>
                          {prop.domain && <p className="text-[10px] text-gray-400 dark:text-gray-600 font-mono mt-0.5">{prop.domain}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <HardDrive size={11} />
                          <span>{prop.asset_count ?? '—'} assets</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isSuperAdmin && (
                            <>
                              <button type="button" onClick={() => setEditProp(prop)} title="Edit property"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                                <Pencil size={13} />
                              </button>
                              <button type="button" onClick={() => setDeleteProp(prop)} title="Delete property"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => !isOffline && select(prop)}
                            disabled={loading || isOffline || isChecking}
                            title={isOffline ? 'Property server is offline' : ''}
                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                              isOffline
                                ? 'bg-red-100 dark:bg-red-900/20 text-red-400 dark:text-red-600 cursor-not-allowed border border-red-200 dark:border-red-800/40'
                                : isChecking
                                  ? 'bg-gray-200 dark:bg-[#222] text-gray-400 cursor-wait'
                                  : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60'
                            }`}>
                            {loading
                              ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Loading…</>
                              : isOffline ? 'Offline'
                              : isChecking ? '…'
                              : 'Select'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showSort && <div className="fixed inset-0 z-40" onClick={() => setShowSort(false)} />}

      {showAddModal && (
        <AddPropertyModal onClose={() => setShowAddModal(false)} onSaved={fetchProperties} />
      )}
      {editProp && (
        <EditPropertyModal prop={editProp} onClose={() => setEditProp(null)} onSaved={fetchProperties} />
      )}
      {deleteProp && (
        <DeleteConfirmModal prop={deleteProp} onClose={() => setDeleteProp(null)} onDeleted={fetchProperties} />
      )}
    </div>
  )
}
