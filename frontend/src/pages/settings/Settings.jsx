import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { Shield, Sun, RefreshCw, CheckCircle, AlertCircle, Download, Loader2, Zap, Bug, Rocket } from 'lucide-react'
import Badge from '../../components/common/Badge'
import api from '../../api/axios'

const CURRENT_VERSION = '7.1.2'

const ROLE_PERMISSIONS = {
  super_admin: ['Full system access', 'User management', 'All CRUD operations', 'System configuration', 'Reports', 'Audit logs'],
  it_admin: ['Manage all assets', 'Software & Hardware CRUD', 'License management', 'Integration management', 'Reports'],
  it_manager: ['View all assets', 'Approve operations', 'Software & Hardware management', 'Reports'],
  asset_manager: ['Hardware management', 'Software management', 'Vendor management', 'Reports'],
  auditor: ['Read-only access to all', 'Reports & analytics', 'Audit logs'],
  user: ['View own assigned assets', 'Basic dashboard'],
}

function UpdateChecker() {
  const { hasRole } = useAuth()
  const canInstall = hasRole('super_admin', 'it_admin')

  const [checking, setChecking]   = useState(false)
  const [installing, setInstalling] = useState(false)
  const [result, setResult]       = useState(null)
  const [installResult, setInstallResult] = useState(null)

  const checkUpdates = async () => {
    setChecking(true)
    setResult(null)
    setInstallResult(null)
    try {
      const res = await api.get('/update/check')
      setResult({ ok: true, data: res.data })
    } catch (err) {
      setResult({ ok: false, error: err.response?.data?.error || err.message })
    }
    setChecking(false)
  }

  const installUpdate = async () => {
    if (!confirm('Apply update now? The server will restart automatically — expect ~30 seconds of downtime.')) return
    setInstalling(true)
    setInstallResult(null)
    try {
      const res = await api.post('/update/apply')
      setInstallResult({ ok: true, message: res.data.message })
    } catch (err) {
      setInstallResult({ ok: false, error: err.response?.data?.error || err.message })
    }
    setInstalling(false)
  }

  const hasUpdate = result?.ok && !result.data.up_to_date

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <RefreshCw size={20} className="text-blue-500" /> Software Updates
        </h2>
        <div className="flex items-center gap-2">
          {hasUpdate && canInstall && (
            <button
              onClick={installUpdate}
              disabled={installing}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {installing ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
              {installing ? 'Installing…' : 'Install Update'}
            </button>
          )}
          <button
            onClick={checkUpdates}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
          >
            {checking ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {checking ? 'Checking…' : 'Check for Updates'}
          </button>
        </div>
      </div>

      {/* Current version */}
      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-xl mb-4">
        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
          <Download size={15} className="text-blue-500 dark:text-blue-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">Optima v{CURRENT_VERSION} Enterprise</p>
          <p className="text-xs text-gray-500">Property client — currently installed</p>
        </div>
        <span className="ml-auto text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800/40 rounded-full">Installed</span>
      </div>

      {/* Install result */}
      {installResult && (
        <div className={`flex items-start gap-3 p-4 rounded-xl mb-4 ${
          installResult.ok
            ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30'
            : 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30'
        }`}>
          {installResult.ok
            ? <CheckCircle size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
            : <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />}
          <div>
            <p className={`text-sm font-semibold ${installResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {installResult.ok ? 'Update in progress' : 'Install failed'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{installResult.ok ? installResult.message : installResult.error}</p>
          </div>
        </div>
      )}

      {/* Check result */}
      {result && (
        result.ok ? (
          result.data.up_to_date ? (
            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 rounded-xl">
              <CheckCircle size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-600 dark:text-green-400">You're up to date!</p>
                <p className="text-xs text-gray-500 mt-0.5">v{result.data.version} is the latest version.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-xl">
                <AlertCircle size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                      Update available: v{result.data.version}
                    </p>
                    {result.data.mandatory && (
                      <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40 rounded-full">Required</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Released {result.data.released_at}</p>
                </div>
              </div>
              {result.data.changelog?.length > 0 && (
                <div className="p-4 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-xl">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                    What's new in v{result.data.version}
                  </p>
                  <ul className="space-y-1.5">
                    {result.data.changelog.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!canInstall && (
                <div className="p-4 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-xl">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Manual update (run on the property server):</p>
                  <pre className="text-xs text-blue-500 dark:text-blue-300 font-mono bg-gray-100 dark:bg-black rounded px-3 py-2">
                    bash /opt/optima-property/deploy/property/update.sh
                  </pre>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl">
            <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Could not check for updates</p>
              <p className="text-xs text-gray-500 mt-0.5">{result.error}</p>
            </div>
          </div>
        )
      )}

      <p className="text-xs text-gray-400 dark:text-gray-600 mt-3">
        Updates are pulled from the GitHub repository and deployed automatically.
        The server restarts after an update — expect ~30 seconds of downtime.
      </p>
    </div>
  )
}

export default function Settings() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 mt-1">System preferences and configuration</p>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Sun size={20} /> Appearance
        </h2>
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-xl">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Theme</p>
            <p className="text-sm text-gray-500">Switch between light and dark mode</p>
          </div>
          <button onClick={toggleTheme} className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${theme === 'dark' ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${theme === 'dark' ? 'translate-x-8' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Check for Updates */}
      <UpdateChecker />

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Shield size={20} /> Role-Based Access Control (RBAC)
        </h2>
        <p className="text-sm text-gray-500 mb-4">System roles and their permissions</p>
        <div className="space-y-3">
          {Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => {
            const roleColors = { super_admin: 'purple', it_admin: 'info', it_manager: 'success', asset_manager: 'warning', auditor: 'orange', user: 'default' }
            const isCurrentRole = user?.role === role || user?.global_role === role
            return (
              <div key={role} className={`p-4 rounded-xl border-2 transition-colors ${isCurrentRole ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-[#2a2a35]'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <Badge variant={roleColors[role] || 'default'}>{role.replace('_', ' ')}</Badge>
                  {isCurrentRole && <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">Your Role</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {perms.map(p => (
                    <span key={p} className="text-xs bg-gray-100 dark:bg-[#1a1a24] text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-full border border-gray-200 dark:border-[#2a2a35]">{p}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Bug size={20} className="text-red-500" /> Bugs & Fixes
        </h2>
        <p className="text-sm text-gray-500 mb-4">Release notes and bug fixes for Optima v{CURRENT_VERSION}</p>

        <div className="space-y-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Rocket size={15} className="text-green-600 dark:text-green-400" />
              <span className="text-sm font-semibold text-green-700 dark:text-green-400">v7.1.2 — April 2026</span>
              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">Current</span>
            </div>
            <div className="space-y-2 mt-3">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">New Features</p>
              <ul className="space-y-1.5">
                {[
                  'Real-time Cloud Intelligence from connected Microsoft 365 integrations',
                  'AI Intelligence anomaly detection with live M365 data analysis',
                  'Cloud Integration catalog with 18+ supported applications',
                  'Per-SKU pricing and cost analytics in Cloud Infrastructure',
                  'Shadow IT detection for disabled accounts and external guests',
                  'License Reclamation with inactive user identification',
                  'Procurement management with approval workflow',
                  'Agent-based hardware & software discovery (Windows/Linux/macOS)',
                  'Hierarchical user management with property-based access control',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 mt-1.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2 mt-4">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Bug Fixes</p>
              <ul className="space-y-1.5">
                {[
                  'Fixed proxy body forwarding for POST/PUT requests through central server',
                  'Fixed stale license counts showing after integration disconnect',
                  'Fixed modal styling in light mode (white background, proper borders)',
                  'Fixed build cache invalidation causing stale frontend bundles',
                  'Fixed property server IP detection using EC2 IMDSv2 metadata',
                  'Resolved MaxListenersExceeded warning on central proxy',
                  'Fixed pagination overflow on large datasets in Cloud Intelligence tables',
                  'Fixed SSO button error messaging for unconfigured providers',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                    <Bug size={10} className="text-red-400 flex-shrink-0 mt-1" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Rocket size={15} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">v7.1.0 — March 2026</span>
            </div>
            <ul className="space-y-1.5 mt-2">
              {[
                'Multi-property architecture with central portal',
                'Dark mode and light mode theme support',
                'CMDB with configuration item relationships',
                'MDM device management and compliance tracking',
                'Contract lifecycle management with renewal alerts',
                'Vendor management with SLA tracking',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0 mt-1.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-[#0d0d0d] border border-gray-200 dark:border-[#1e1e1e] rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Rocket size={15} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">v7.0.0 — February 2026</span>
            </div>
            <ul className="space-y-1.5 mt-2">
              {[
                'Initial release of Optima ITAM platform',
                'Software and Hardware asset management',
                'License tracking and compliance reporting',
                'Role-based access control (5 roles)',
                'Executive dashboard with real-time metrics',
                'Reports and export functionality',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0 mt-1.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
