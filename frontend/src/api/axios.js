import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
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
