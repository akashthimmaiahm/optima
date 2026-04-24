import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import Layout from './components/Layout/Layout'
import Login from './pages/Login'
import PropertySelector from './pages/PropertySelector'
import Dashboard from './pages/Dashboard'
import SoftwareAssets from './pages/software/SoftwareAssets'
import HardwareAssets from './pages/hardware/HardwareAssets'
import LicenseManagement from './pages/licenses/LicenseManagement'
import CloudIntegrations from './pages/integrations/CloudIntegrations'
import CloudIntelligence from './pages/integrations/CloudIntelligence'
import UserManagement from './pages/users/UserManagement'
import Vendors from './pages/vendors/Vendors'
import Contracts from './pages/contracts/Contracts'
import Reports from './pages/reports/Reports'
import Settings from './pages/settings/Settings'
import CMDB from './pages/cmdb/CMDB'
import AIIntelligence from './pages/ai-intelligence/AIIntelligence'
import MDM from './pages/mdm/MDM'
import Properties from './pages/properties/Properties'
import Procurement from './pages/procurement/Procurement'

// Must be logged in
function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Must be logged in AND have selected a property
function PropertyRoute({ children }) {
  const { user, selectedProperty, accessibleProperties } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!selectedProperty) {
    // Auto-select if only one property
    if (accessibleProperties.length === 1) return children
    return <Navigate to="/select-property" replace />
  }
  return children
}

function AppRoutes() {
  const { user, selectedProperty, accessibleProperties } = useAuth()
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to={selectedProperty || accessibleProperties.length === 1 ? '/' : '/select-property'} replace /> : <Login />} />

      {/* Property selector — must be logged in, no property needed yet */}
      <Route path="/select-property" element={
        <ProtectedRoute>
          <PropertySelector />
        </ProtectedRoute>
      } />

      {/* App — must have a property selected */}
      <Route path="/" element={<PropertyRoute><Layout /></PropertyRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="software"           element={<SoftwareAssets />} />
        <Route path="hardware"           element={<HardwareAssets />} />
        <Route path="licenses"           element={<LicenseManagement />} />
        <Route path="integrations"       element={<CloudIntegrations />} />
        <Route path="cloud-intelligence" element={<CloudIntelligence />} />
        <Route path="users"              element={<UserManagement />} />
        <Route path="vendors"            element={<Vendors />} />
        <Route path="contracts"          element={<Contracts />} />
        <Route path="cmdb"               element={<CMDB />} />
        <Route path="ai-intelligence"    element={<AIIntelligence />} />
        <Route path="mdm"                element={<MDM />} />
        <Route path="properties"         element={<Properties />} />
        <Route path="procurement"        element={<Procurement />} />
        <Route path="reports"            element={<Reports />} />
        <Route path="settings"           element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
