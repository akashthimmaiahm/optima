import axios from 'axios'

// In Electron builds VITE_API_URL=https://optima.sclera.com is injected at build time.
// In web (dev/prod) it falls back to the relative /api path.
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

// Cache of property_id → direct ec2_url for local/on-prem properties.
// Once a property is known to be unreachable via the central proxy,
// all subsequent requests go directly to the property server.
const directUrlCache = {}

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

function getSelectedProperty() {
  try {
    return JSON.parse(localStorage.getItem('optima_selected_property'))
  } catch { return null }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('optima_token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  const prop = getSelectedProperty()
  if (prop?.id) {
    config._propertyId = prop.id

    // If this property is known to need direct connection, rewrite baseURL immediately
    if (directUrlCache[prop.id]) {
      config.baseURL = directUrlCache[prop.id] + '/api'
      // Don't send X-Property-Id to the property server (it doesn't need it)
    } else {
      config.headers['X-Property-Id'] = String(prop.id)
    }
  }

  return config
})

async function fetchDirectUrl(propertyId, authHeader) {
  if (directUrlCache[propertyId]) return directUrlCache[propertyId]
  const resp = await axios.get(`${BASE}/portal/properties/${propertyId}/direct-url`, {
    headers: { Authorization: authHeader },
  })
  directUrlCache[propertyId] = resp.data.ec2_url
  return resp.data.ec2_url
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('optima_token')
      localStorage.removeItem('optima_user')
      localStorage.removeItem('optima_properties')
      localStorage.removeItem('optima_selected_property')
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // If the central proxy can't reach the property, switch to direct connection
    const errCode = error.response?.data?.error
    if ((errCode === 'property_unreachable' || errCode === 'property_timeout') && !error.config._directRetry) {
      const propertyId = error.config._propertyId
      if (!propertyId) return Promise.reject(error)

      try {
        const directUrl = await fetchDirectUrl(propertyId, error.config.headers.Authorization)
        const retryConfig = { ...error.config, _directRetry: true }
        retryConfig.baseURL = directUrl + '/api'
        delete retryConfig.headers['X-Property-Id']
        return api.request(retryConfig)
      } catch {
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

export default api
