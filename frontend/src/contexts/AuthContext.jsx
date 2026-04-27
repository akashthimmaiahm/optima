import { createContext, useContext, useState } from 'react'
import api from '../api/axios'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('optima_user')) } catch { return null }
  })

  // Properties the user can access (populated at login from central server)
  const [accessibleProperties, setAccessibleProperties] = useState(() => {
    try { return JSON.parse(localStorage.getItem('optima_properties')) || [] } catch { return [] }
  })

  // The currently selected property (set on PropertySelector page)
  const [selectedProperty, setSelectedPropertyState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('optima_selected_property')) } catch { return null }
  })

  const setSelectedProperty = (prop) => {
    if (prop) {
      localStorage.setItem('optima_selected_property', JSON.stringify(prop))
    } else {
      localStorage.removeItem('optima_selected_property')
    }
    setSelectedPropertyState(prop)
  }

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password })
    const { token, user, properties = [] } = response.data
    localStorage.setItem('optima_token', token)
    localStorage.setItem('optima_user', JSON.stringify(user))
    localStorage.setItem('optima_properties', JSON.stringify(properties))
    setUser(user)
    setAccessibleProperties(properties)
    // Auto-select if user only has one property
    if (properties.length === 1) {
      setSelectedProperty(properties[0])
    } else {
      setSelectedProperty(null)
    }
    return { user, properties }
  }

  const loginWithToken = (token, userData, properties = []) => {
    localStorage.setItem('optima_token', token)
    localStorage.setItem('optima_user', JSON.stringify(userData))
    localStorage.setItem('optima_properties', JSON.stringify(properties))
    setUser(userData)
    setAccessibleProperties(properties)
    if (properties.length === 1) {
      setSelectedProperty(properties[0])
    } else {
      setSelectedProperty(null)
    }
  }

  const logout = () => {
    localStorage.removeItem('optima_token')
    localStorage.removeItem('optima_user')
    localStorage.removeItem('optima_properties')
    localStorage.removeItem('optima_selected_property')
    setUser(null)
    setAccessibleProperties([])
    setSelectedPropertyState(null)
  }

  const hasRole = (...roles) => roles.includes(user?.role) || user?.role === 'super_admin'
    || roles.includes(user?.global_role) || user?.global_role === 'super_admin'

  return (
    <AuthContext.Provider value={{
      user,
      accessibleProperties,
      setAccessibleProperties,
      selectedProperty,
      setSelectedProperty,
      login,
      loginWithToken,
      logout,
      hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
