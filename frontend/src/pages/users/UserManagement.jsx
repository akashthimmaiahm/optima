import { useEffect, useState } from 'react'
import { Plus, Search, Edit, UserX, RefreshCw } from 'lucide-react'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { useAuth } from '../../contexts/AuthContext'

const roleColors = { super_admin: 'purple', it_admin: 'info', it_manager: 'success', asset_manager: 'warning', auditor: 'orange', user: 'default' }
const roles = ['super_admin', 'it_admin', 'it_manager', 'asset_manager', 'auditor', 'user']

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user', department: '', phone: '', is_active: 1 })
  const { hasRole, user: currentUser } = useAuth()

  const load = () => {
    setLoading(true)
    api.get('/users').then(r => setUsers(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { setEditItem(null); setForm({ name: '', email: '', password: '', role: 'user', department: '', phone: '', is_active: 1 }); setModalOpen(true) }
  const openEdit = (u) => { setEditItem(u); setForm({ ...u, password: '' }); setModalOpen(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const data = { ...form }
      if (!data.password) delete data.password
      if (editItem) await api.put(`/users/${editItem.id}`, data)
      else await api.post('/users', data)
      setModalOpen(false)
      load()
    } catch (err) { alert(err.response?.data?.error || 'Error') }
  }

  const handleDeactivate = async (id) => {
    if (!confirm('Deactivate this user?')) return
    await api.delete(`/users/${id}`)
    load()
  }

  const filtered = users.filter(u => {
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false
    if (filterRole && u.role !== filterRole) return false
    if (filterStatus === 'active' && !u.is_active) return false
    if (filterStatus === 'inactive' && u.is_active) return false
    return true
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{users.length} users in system</p>
        </div>
        {hasRole('super_admin', 'it_admin') && <button onClick={openAdd} className="btn-primary"><Plus size={18} /> Add User</button>}
      </div>

      <div className="card p-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input placeholder="Search users..." className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">All Roles</option>
          {roles.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
        </select>
        <select className="input w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button onClick={load} className="btn-secondary"><RefreshCw size={16} /></button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header">User</th>
                <th className="table-header">Role</th>
                <th className="table-header">Department</th>
                <th className="table-header">Last Login</th>
                <th className="table-header">Status</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading...</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">No users found</td></tr>
              : filtered.map(u => (
                <tr key={u.id} className="table-row">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-white">{u.name[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{u.name}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell"><Badge variant={roleColors[u.role] || 'default'}>{u.role.replace('_', ' ')}</Badge></td>
                  <td className="table-cell text-gray-500">{u.department || '—'}</td>
                  <td className="table-cell text-gray-500">{u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
                  <td className="table-cell"><Badge variant={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="table-cell">
                    <div className="flex gap-1">
                      {hasRole('super_admin', 'it_admin') && <button onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors"><Edit size={15} /></button>}
                      {hasRole('super_admin') && u.id !== currentUser?.id && <button onClick={() => handleDeactivate(u.id)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-red-600 transition-colors"><UserX size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit User' : 'Add User'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="label">Full Name *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div><label className="label">Email *</label><input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required /></div>
          <div><label className="label">{editItem ? 'New Password (leave blank to keep)' : 'Password *'}</label><input type="password" className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required={!editItem} /></div>
          <div><label className="label">Role</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {roles.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div><label className="label">Department</label><input className="input" value={form.department || ''} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          {editItem && (
            <div className="flex items-center gap-3">
              <input type="checkbox" id="active" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))} className="w-4 h-4 text-blue-600 rounded" />
              <label htmlFor="active" className="text-sm text-gray-700 dark:text-gray-300">Active account</label>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editItem ? 'Update' : 'Create'} User</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
