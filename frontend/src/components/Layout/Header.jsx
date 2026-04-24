import { Bell, Menu, Sun, Moon, X, Activity } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import api from '../../api/axios'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/software': 'Software Assets',
  '/hardware': 'Hardware Assets',
  '/licenses': 'License Management',
  '/integrations': 'Cloud Integrations',
  '/cloud-intelligence': 'Cloud Intelligence',
  '/cmdb': 'CMDB',
  '/ai-intelligence': 'AI Intelligence',
  '/mdm': 'MDM',
  '/vendors': 'Vendors',
  '/contracts': 'Contracts',
  '/reports': 'Reports',
  '/procurement': 'Procurement',
  '/users': 'User Management',
  '/settings': 'Settings',
}

function NotificationsPanel({ onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard/stats')
      .then(r => setItems(r.data.recentAuditLogs || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="absolute right-0 top-full mt-2 w-80 bg-[#1a1a1f] border border-[#2a2a35] rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a35]">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-blue-400" />
          <span className="text-sm font-semibold text-white">Recent Activity</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-center text-gray-500 text-sm py-8">No recent activity</p>
        ) : items.map(log => (
          <div key={log.id} className="flex items-start gap-3 px-4 py-3 border-b border-[#2a2a35] last:border-0 hover:bg-[#22222e] transition-colors">
            <div className="w-7 h-7 bg-blue-600/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-blue-400">{log.user_name?.[0] || '?'}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-300 leading-relaxed">
                <span className="font-medium text-white">{log.user_name}</span>
                {' — '}{log.details}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">{new Date(log.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-2 border-t border-[#2a2a35]">
        <p className="text-xs text-gray-600 text-center">Showing last {items.length} events</p>
      </div>
    </div>
  )
}

export default function Header({ onMenuToggle }) {
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const pageTitle = PAGE_TITLES[location.pathname] || 'Optima'

  const [notifOpen, setNotifOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(true)
  const notifRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleBellClick = () => {
    setNotifOpen(o => !o)
    setHasUnread(false)
  }

  return (
    <header className="bg-white dark:bg-[#0e0e12] border-b border-gray-200 dark:border-[#2a2a35] h-14 flex items-center px-5 gap-4 flex-shrink-0">
      <button
        onClick={onMenuToggle}
        className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 transition-colors"
      >
        <Menu size={18} />
      </button>
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-gray-400 dark:text-gray-500">Optima</span>
        <span className="text-gray-300 dark:text-gray-600">/</span>
        <span className="text-gray-800 dark:text-gray-200 font-medium">{pageTitle}</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1e1e28] hover:text-gray-800 dark:hover:text-gray-300 transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={handleBellClick}
            className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-[#1e1e28] hover:text-gray-800 dark:hover:text-gray-300 transition-colors"
          >
            <Bell size={17} />
            {hasUnread && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
            )}
          </button>
          {notifOpen && <NotificationsPanel onClose={() => setNotifOpen(false)} />}
        </div>

      </div>
    </header>
  )
}
