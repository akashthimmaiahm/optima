import axios from 'axios'

// In Electron builds VITE_API_URL=https://optima.sclera.com is injected at build time.
// In web (dev/prod) it falls back to the relative /api path.
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

// Cache of property_id → direct ec2_url for local/on-prem properties
const directUrlCache = {}

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('optima_token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  // Tell the central proxy which property to route this request to
  try {
    const prop = JSON.parse(localStorage.getItem('optima_selected_property'))
    if (prop?.id) {
      config.headers['X-Property-Id'] = String(prop.id)
      config._propertyId = prop.id
    }
  } catch { /* ignore */ }

  return config
})

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

    // If the central proxy can't reach the property server, try direct connection
    const errCode = error.response?.data?.error
    if ((errCode === 'property_unreachable' || errCode === 'property_timeout') && !error.config._directRetry) {
      const propertyId = error.config._propertyId
      if (!propertyId) return Promise.reject(error)

      try {
        // Get the direct URL (cached or fetched)
        let directUrl = directUrlCache[propertyId]
        if (!directUrl) {
          const resp = await axios.get(`${BASE}/portal/properties/${propertyId}/direct-url`, {
            headers: { Authorization: error.config.headers.Authorization },
          })
          directUrl = resp.data.ec2_url
          directUrlCache[propertyId] = directUrl
        }

        // Retry the original request directly to the property server
        const retryConfig = { ...error.config, _directRetry: true }
        retryConfig.baseURL = directUrl + '/api'
        // Remove proxy header
        delete retryConfig.headers['X-Property-Id']
        return api.request(retryConfig)
      } catch {
        // Direct connection also failed — return original error
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

export default api
