import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Monitor, HardDrive, Key, Cloud, Cpu, Database,
  Brain, Smartphone, Building2, FileText, BarChart3, Settings, Users,
  Bot, Layers, ShoppingCart, LogOut, User
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import logoUrl from '../../assets/optima-logo.png'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/software', icon: Monitor, label: 'Software Assets' },
  { to: '/hardware', icon: HardDrive, label: 'Hardware Assets' },
  { to: '/licenses', icon: Key, label: 'License Management' },
  { to: '/integrations', icon: Cloud, label: 'Cloud Integrations' },
  { to: '/cloud-intelligence', icon: Cpu, label: 'Cloud Intelligence' },
  { to: '/cmdb', icon: Database, label: 'CMDB' },
  { to: '/ai-intelligence', icon: Brain, label: 'AI Intelligence' },
  { to: '/mdm', icon: Smartphone, label: 'MDM' },
  { to: '/vendors', icon: Building2, label: 'Vendors' },
  { to: '/contracts', icon: FileText, label: 'Contracts' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/procurement', icon: ShoppingCart, label: 'Procurement', adminOnly: true },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar({ isOpen }) {
  const { hasRole, user, selectedProperty, logout } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  if (!isOpen) return null

  return (
    <aside className="w-64 bg-white dark:bg-[#1a1a1f] flex flex-col flex-shrink-0 border-r border-gray-200 dark:border-[#2a2a35]">

      {/* Logo / Brand */}
      <div className="p-4 border-b border-gray-200 dark:border-[#2a2a35]">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <img
            src={logoUrl}
            alt="Optima"
            className="h-7 w-auto object-contain flex-shrink-0"
            style={theme === 'dark' ? { filter: 'brightness(0) invert(1)' } : {}}
          />
        </div>
        {selectedProperty && (
          <div className="mt-1 px-3 py-1 flex items-center gap-2">
            <Building2 size={12} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate">{selectedProperty.name}</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {navItems.map(item => {
          if (item.adminOnly && !hasRole('super_admin', 'it_admin', 'it_manager')) return null
          if (item.superAdminOnly && !hasRole('super_admin')) return null
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#22222e] hover:text-gray-900 dark:hover:text-gray-200'
                }`
              }
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* AI badge + All Properties */}
      <div className="px-3 pt-2 pb-1 space-y-1">
        <div className="px-3 py-2 rounded-lg bg-blue-50 dark:bg-[#0e0e12] flex items-center gap-2.5">
          <Bot size={15} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">AI Assistant Active</span>
        </div>
        <button
          onClick={() => navigate('/select-property')}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-500 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-[#22222e] hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <Layers size={15} />
          <span className="text-xs font-medium">All Properties</span>
        </button>
      </div>

      {/* User info + logout */}
      <div className="p-3 border-t border-gray-200 dark:border-[#2a2a35]">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-[#22222e] transition-colors group">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize truncate">{user?.role?.replace(/_/g, ' ')}</p>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-600 text-center mt-1.5">Optima v7.1.2 Enterprise</p>
      </div>
    </aside>
  )
}
