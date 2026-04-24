import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, RefreshCw, Zap, Settings, Info, Key, Globe, Users, Shield, Database, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../../api/axios'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import { useAuth } from '../../contexts/AuthContext'

const providerMeta = {
  Microsoft:  { emoji: '🔷', color: 'bg-blue-100 dark:bg-blue-900/30' },
  Google:     { emoji: '🔵', color: 'bg-red-50 dark:bg-red-900/20' },
  Salesforce: { emoji: '☁️', color: 'bg-sky-50 dark:bg-sky-900/20' },
  Amazon:     { emoji: '🟠', color: 'bg-orange-50 dark:bg-orange-900/20' },
  Atlassian:  { emoji: '🔷', color: 'bg-blue-50 dark:bg-blue-900/20' },
  Adobe:      { emoji: '🔴', color: 'bg-red-50 dark:bg-red-900/20' },
  Okta:       { emoji: '🔐', color: 'bg-blue-50 dark:bg-blue-900/20' },
  Dropbox:    { emoji: '📦', color: 'bg-blue-50 dark:bg-blue-900/20' },
  Zoom:       { emoji: '🎥', color: 'bg-blue-50 dark:bg-blue-900/20' },
  ServiceNow: { emoji: '🟢', color: 'bg-green-50 dark:bg-green-900/20' },
  CrowdStrike:{ emoji: '🛡️', color: 'bg-red-50 dark:bg-red-900/20' },
  Datadog:    { emoji: '📊', color: 'bg-purple-50 dark:bg-purple-900/20' },
  Workday:    { emoji: '👥', color: 'bg-yellow-50 dark:bg-yellow-900/20' },
}

const typeColors = {
  productivity: 'blue', crm: 'success', cloud: 'purple', communication: 'info',
  development: 'warning', identity: 'purple', storage: 'default', itsm: 'default',
  design: 'danger', project_management: 'warning', endpoint_management: 'info',
  security: 'danger', monitoring: 'purple', hr: 'success',
}

// Per-provider config field definitions
const providerFields = {
  oauth2: [
    { key: 'client_id',     label: 'Client ID',      placeholder: 'e.g. 89abc123-def4-5678-...',   required: true },
    { key: 'client_secret', label: 'Client Secret',  placeholder: 'Enter client secret',            type: 'password', required: true, configKey: true },
    { key: 'tenant_id',     label: 'Tenant / Domain',placeholder: 'e.g. contoso.onmicrosoft.com',  required: true },
    { key: 'scopes',        label: 'OAuth Scopes',   placeholder: 'e.g. User.Read,Directory.Read', configKey: true },
    { key: 'webhook_url',   label: 'Webhook URL',    placeholder: 'https://your-server/webhook',   configKey: true },
  ],
  api_key: [
    { key: 'api_key',       label: 'API Key / Token',placeholder: 'Enter API key or token',         type: 'password', required: true, configKey: true },
    { key: 'tenant_id',     label: 'Domain / Instance URL', placeholder: 'e.g. contoso.atlassian.net' },
  ],
  service_account: [
    { key: 'client_id',     label: 'Service Account Email', placeholder: 'sa@project.iam.gserviceaccount.com', required: true },
    { key: 'client_secret', label: 'Private Key (JSON)',    placeholder: 'Paste service account JSON key', type: 'textarea', required: true, configKey: true },
    { key: 'tenant_id',     label: 'Project ID',            placeholder: 'your-gcp-project-id' },
  ],
}

const syncOptions = ['realtime', 'hourly', 'daily', 'weekly']

function ConfigModal({ integration, mode, onClose, onSaved }) {
  const isConnect = mode === 'connect'
  const existing = integration?.config || {}

  const [form, setForm] = useState({
    auth_type: integration?.auth_type || 'oauth2',
    client_id: integration?.client_id || '',
    tenant_id: integration?.tenant_id || '',
    api_endpoint: integration?.api_endpoint || '',
    sync_frequency: integration?.sync_frequency || 'daily',
    client_secret: existing.client_secret || '',
    api_key: existing.api_key || '',
    scopes: existing.scopes || '',
    webhook_url: existing.webhook_url || '',
    region: existing.region || '',
    instance_url: existing.instance_url || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fields = providerFields[form.auth_type] || providerFields.oauth2

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const endpoint = isConnect
        ? `/integrations/${integration.id}/connect`
        : `/integrations/${integration.id}/configure`
      await api.put(endpoint, form)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save configuration')
    } finally { setSaving(false) }
  }

  const meta = providerMeta[integration?.provider] || { emoji: '🔌', color: 'bg-gray-100' }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={`flex items-center gap-3 p-4 rounded-xl ${meta.color}`}>
        <span className="text-3xl">{meta.emoji}</span>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-lg">{integration?.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{integration?.api_endpoint}</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Auth type + sync */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Authentication Type</label>
            <select className="input" value={form.auth_type} onChange={e => set('auth_type', e.target.value)}>
              <option value="oauth2">OAuth 2.0</option>
              <option value="api_key">API Key / Token</option>
              <option value="service_account">Service Account</option>
            </select>
          </div>
          <div>
            <label className="label">Sync Frequency</label>
            <select className="input" value={form.sync_frequency} onChange={e => set('sync_frequency', e.target.value)}>
              {syncOptions.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Dynamic auth fields */}
        <div className="space-y-3 border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Key size={12} /> Credentials</p>
          {fields.map(f => (
            <div key={f.key}>
              <label className="label">{f.label}{f.required && <span className="text-red-500 ml-1">*</span>}</label>
              {f.type === 'textarea' ? (
                <textarea className="input font-mono text-xs" rows={3} placeholder={f.placeholder} value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} required={f.required} />
              ) : (
                <input className="input" type={f.type || 'text'} placeholder={f.placeholder} value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} required={f.required} />
              )}
            </div>
          ))}
        </div>

        {/* Advanced settings */}
        <div className="space-y-3 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Settings size={12} /> Advanced Settings</p>
          <div>
            <label className="label">API Endpoint URL</label>
            <input className="input font-mono text-sm" value={form.api_endpoint} onChange={e => set('api_endpoint', e.target.value)} placeholder="https://api.example.com/v1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Region / Instance</label>
              <input className="input" value={form.region} onChange={e => set('region', e.target.value)} placeholder="e.g. us-east-1, eu-west" />
            </div>
            <div>
              <label className="label">Instance URL</label>
              <input className="input" value={form.instance_url} onChange={e => set('instance_url', e.target.value)} placeholder="e.g. https://your-instance.com" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            <Zap size={16} />
            {saving ? 'Saving...' : isConnect ? 'Connect Integration' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  )
}

function IntegrationCard({ integration, canManage, onRefresh }) {
  const [syncing, setSyncing] = useState(false)
  const [configModal, setConfigModal] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const isConnected = integration.status === 'connected'
  const meta = providerMeta[integration.provider] || { emoji: '🔌', color: 'bg-gray-100' }

  const handleSync = async () => {
    setSyncing(true)
    try { await api.post(`/integrations/${integration.id}/sync`); onRefresh() } catch {}
    setSyncing(false)
  }

  const handleDisconnect = async () => {
    if (!confirm(`Disconnect ${integration.name}?`)) return
    await api.put(`/integrations/${integration.id}/disconnect`)
    onRefresh()
  }

  return (
    <>
      <div className={`card p-5 flex flex-col gap-3 transition-all ${!isConnected ? 'opacity-75' : ''}`}>
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${meta.color}`}>
              {meta.emoji}
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{integration.name}</p>
              <Badge variant={typeColors[integration.type] || 'default'}>{integration.type.replace(/_/g, ' ')}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /><span className="text-xs text-green-600 dark:text-green-400 font-medium">Live</span></>
            ) : (
              <><div className="w-2 h-2 rounded-full bg-gray-400" /><span className="text-xs text-gray-400">Offline</span></>
            )}
          </div>
        </div>

        {/* Stats (connected only) */}
        {isConnected && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-400">Licenses</p>
              <p className="font-bold text-gray-900 dark:text-white text-sm">{integration.licenses_discovered}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-400">Users</p>
              <p className="font-bold text-gray-900 dark:text-white text-sm">{integration.users_synced}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-400">Frequency</p>
              <p className="font-bold text-gray-900 dark:text-white text-sm capitalize">{integration.sync_frequency || '—'}</p>
            </div>
          </div>
        )}

        {/* Config summary (expandable) */}
        {isConnected && integration.client_id && (
          <button onClick={() => setExpanded(e => !e)} className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            <span className="flex items-center gap-1"><Info size={12} /> Connection details</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        {expanded && isConnected && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-gray-400">Auth Type</span><span className="font-medium text-gray-700 dark:text-gray-300 uppercase">{integration.auth_type}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Client ID</span><span className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{integration.client_id}</span></div>
            {integration.tenant_id && <div className="flex justify-between"><span className="text-gray-400">Tenant / Domain</span><span className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[160px]">{integration.tenant_id}</span></div>}
            <div className="flex justify-between"><span className="text-gray-400">Last Sync</span><span className="text-gray-700 dark:text-gray-300">{integration.last_sync ? new Date(integration.last_sync).toLocaleString() : 'Never'}</span></div>
          </div>
        )}

        {/* Actions */}
        {canManage && (
          <div className="flex gap-2 mt-auto pt-1">
            {isConnected ? (
              <>
                <button onClick={handleSync} disabled={syncing} className="btn-secondary text-xs py-1.5 flex-1">
                  <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
                <button onClick={() => setConfigModal(true)} className="btn-secondary text-xs py-1.5 px-3" title="Configure">
                  <Settings size={14} />
                </button>
                <button onClick={handleDisconnect} className="btn-secondary text-xs py-1.5 px-3 text-red-500 hover:text-red-600" title="Disconnect">
                  <XCircle size={14} />
                </button>
              </>
            ) : (
              <button onClick={() => setConfigModal(true)} className="btn-primary text-xs py-1.5 w-full justify-center">
                <Zap size={14} /> Connect & Configure
              </button>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={configModal} onClose={() => setConfigModal(false)} title={isConnected ? `Configure — ${integration.name}` : `Connect — ${integration.name}`} size="lg">
        <ConfigModal
          integration={integration}
          mode={isConnected ? 'configure' : 'connect'}
          onClose={() => setConfigModal(false)}
          onSaved={onRefresh}
        />
      </Modal>
    </>
  )
}

export default function CloudIntegrations() {
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [reseeding, setReseeding] = useState(false)
  const { hasRole } = useAuth()
  const canManage = hasRole('super_admin', 'it_admin', 'it_manager')

  const load = () => {
    setLoading(true)
    api.get('/integrations').then(r => setIntegrations(r.data.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleReseed = async () => {
    setReseeding(true)
    try { await api.post('/integrations/reseed'); load() } catch (err) { alert(err.response?.data?.error || 'Reseed failed') }
    setReseeding(false)
  }

  const connected = integrations.filter(i => i.status === 'connected')
  const disconnected = integrations.filter(i => i.status !== 'connected')

  const types = ['all', ...new Set(integrations.map(i => i.type))]
  const filtered = integrations.filter(i => filter === 'all' || i.type === i.type).filter(i => filter === 'all' || i.type === filter)

  const connectedFiltered = filtered.filter(i => i.status === 'connected')
  const disconnectedFiltered = filtered.filter(i => i.status !== 'connected')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cloud Integrations</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage SaaS & cloud application connections for license discovery</p>
        </div>
        {canManage && (
          <button onClick={handleReseed} disabled={reseeding} className="btn-secondary text-sm">
            <Database size={16} className={reseeding ? 'animate-spin' : ''} />
            {reseeding ? 'Loading...' : 'Load Sample Data'}
          </button>
        )}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Connected', value: connected.length, icon: CheckCircle2, color: 'text-green-600' },
          { label: 'Available', value: disconnected.length, icon: XCircle, color: 'text-gray-400' },
          { label: 'Licenses Discovered', value: integrations.reduce((a, b) => a + (b.licenses_discovered || 0), 0).toLocaleString(), icon: Key, color: 'text-blue-600' },
          { label: 'Users Synced', value: integrations.reduce((a, b) => a + (b.users_synced || 0), 0).toLocaleString(), icon: Users, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
              <s.icon size={22} className={`${s.color} opacity-60`} />
            </div>
          </div>
        ))}
      </div>

      {/* Type filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize ${filter === t ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
            {t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>
      ) : (
        <>
          {/* Connected */}
          {connectedFiltered.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-500" /> Connected ({connectedFiltered.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {connectedFiltered.map(i => <IntegrationCard key={i.id} integration={i} canManage={canManage} onRefresh={load} />)}
              </div>
            </div>
          )}

          {/* Disconnected */}
          {disconnectedFiltered.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <XCircle size={16} className="text-gray-400" /> Available to Connect ({disconnectedFiltered.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {disconnectedFiltered.map(i => <IntegrationCard key={i.id} integration={i} canManage={canManage} onRefresh={load} />)}
              </div>
            </div>
          )}

          {integrations.length === 0 && (
            <div className="card p-12 text-center">
              <Globe size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No integrations found</p>
              <p className="text-sm text-gray-400 mt-1">Click "Load Sample Data" to seed cloud integrations</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
