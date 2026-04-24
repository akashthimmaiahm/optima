import axios from 'axios'

// In Electron builds VITE_API_URL=https://optima.sclera.com is injected at build time.
// In web (dev/prod) it falls back to the relative /api path.
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

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
    if (prop?.id) config.headers['X-Property-Id'] = String(prop.id)
  } catch { /* ignore */ }

  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('optima_token')
      localStorage.removeItem('optima_user')
      localStorage.removeItem('optima_properties')
      localStorage.removeItem('optima_selected_property')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
