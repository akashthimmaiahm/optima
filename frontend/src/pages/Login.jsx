import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2, ArrowRight, Zap } from 'lucide-react'
import logoUrl from '../assets/optima-logo.png'
import { useTheme } from '../contexts/ThemeContext'

export default function Login() {
  const [form, setForm] = useState({ email: 'admin@optima.com', password: 'Admin@123' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ssoLoading, setSsoLoading] = useState('')
  const { login } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { properties } = await login(form.email, form.password)
      if (properties.length === 1) {
        navigate('/')
      } else {
        navigate('/select-property')
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSSO = (provider) => {
    setSsoLoading(provider)
    setTimeout(() => {
      setSsoLoading('')
      setError(`${provider} SSO is configured for production. Use demo credentials below.`)
    }, 1500)
  }

  const accounts = [
    { label: 'Super Admin', email: 'admin@optima.com', password: 'Admin@123', color: 'text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20' },
    { label: 'IT Manager', email: 'manager@optima.com', password: 'Manager@123', color: 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20' },
    { label: 'IT Admin', email: 'itadmin@optima.com', password: 'ITAdmin@123', color: 'text-green-600 dark:text-green-400 border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20' },
    { label: 'Auditor', email: 'auditor@optima.com', password: 'Audit@123', color: 'text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20' },
    { label: 'End User', email: 'john@optima.com', password: 'User@123', color: 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0e0e12] flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center p-12 bg-gradient-to-br from-gray-100 via-blue-50 to-gray-100 dark:from-[#0e0e12] dark:via-[#1a1a2e] dark:to-[#0e0e12] border-r border-gray-200 dark:border-[#2a2a35]">
        <div className="max-w-md text-center">
          <img
            src={logoUrl}
            alt="Optima"
            className="h-16 w-auto object-contain mx-auto mb-6"
            style={theme === 'dark' ? { filter: 'brightness(0) invert(1)' } : {}}
          />
          <p className="text-gray-500 dark:text-gray-400 mb-10 text-lg">Enterprise Asset Management Platform</p>
          <div className="grid grid-cols-2 gap-3 text-left">
            {[
              'Software Asset Management',
              'Hardware Asset Management',
              'AI License Tracking',
              'Cloud Intelligence',
              'CMDB & Relationships',
              'Anomaly Detection',
              'MDM Integration',
              'Cost Optimization',
            ].map(f => (
              <div key={f} className="flex items-center gap-2 text-gray-500 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-[440px] flex items-center justify-center p-8 bg-white dark:bg-[#0e0e12]">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex justify-center mb-8">
            <img
              src={logoUrl}
              alt="Optima"
              className="h-10 w-auto object-contain"
              style={theme === 'dark' ? { filter: 'brightness(0) invert(1)' } : {}}
            />
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Sign in</h2>
          <p className="text-gray-500 mb-7 text-sm">Access your Optima workspace</p>

          {/* SSO Buttons */}
          <div className="space-y-2 mb-6">
            <button
              onClick={() => handleSSO('Microsoft')}
              disabled={!!ssoLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-[#3a3a4a] bg-white dark:bg-[#1a1a1f] hover:bg-gray-50 dark:hover:bg-[#22222e] text-gray-700 dark:text-gray-200 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {ssoLoading === 'Microsoft' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
              )}
              Sign in with Microsoft
            </button>
            <button
              onClick={() => handleSSO('Sclera')}
              disabled={!!ssoLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-purple-300 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-300 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {ssoLoading === 'Sclera' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Zap size={16} />
              )}
              Sign in with Sclera SSO
            </button>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-gray-200 dark:bg-[#2a2a35]" />
            <span className="text-xs text-gray-400 dark:text-gray-600">or use credentials</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-[#2a2a35]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800/50 text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6">
            <p className="text-xs text-gray-400 dark:text-gray-600 mb-2 font-medium uppercase tracking-wider">Demo Accounts</p>
            <div className="space-y-1.5">
              {accounts.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => setForm({ email: acc.email, password: acc.password })}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${acc.color}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{acc.label}</span>
                    <span className="text-xs opacity-60 font-mono">{acc.password}</span>
                  </div>
                  <p className="text-xs opacity-50 mt-0.5">{acc.email}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
