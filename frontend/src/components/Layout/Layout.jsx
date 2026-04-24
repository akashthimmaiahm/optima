import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useState } from 'react'
import ChatBot from '../ChatBot/ChatBot'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-[#0e0e12] overflow-hidden">
      <Sidebar isOpen={sidebarOpen} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header onMenuToggle={() => setSidebarOpen(o => !o)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <ChatBot />
    </div>
  )
}
