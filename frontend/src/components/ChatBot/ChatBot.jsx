import { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, X, Send, Sparkles, AlertCircle, RefreshCw, Cpu, ChevronDown } from 'lucide-react'
import api from '../../api/axios'

const QUICK_PROMPTS = [
  'What licenses are expiring soon?',
  'Show hardware in repair',
  'How can I reduce costs?',
  'What are the critical CIs?',
  'Summarize AI platform usage',
  'Any anomalies detected?',
]

function Message({ msg }) {
  const isUser = msg.role === 'user'
  const isError = msg.role === 'error'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-1 mr-1.5">
          <Bot size={11} className="text-white" />
        </div>
      )}
      <div className={`max-w-[82%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap ${
        isUser
          ? 'bg-blue-600 text-white rounded-br-sm'
          : isError
          ? 'bg-red-900/30 text-red-300 border border-red-800/50 rounded-bl-sm'
          : 'bg-[#22222e] text-gray-200 rounded-bl-sm border border-[#2a2a35]'
      }`}>
        {msg.text}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-1 mr-1.5">
        <Bot size={11} className="text-white" />
      </div>
      <div className="bg-[#22222e] border border-[#2a2a35] px-3 py-2.5 rounded-xl rounded-bl-sm flex gap-1 items-center">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  )
}

export default function ChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [llmStatus, setLlmStatus] = useState(null) // null | { available, provider, model, message }
  const [showPrompts, setShowPrompts] = useState(true)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  // Check LLM availability when chat opens
  const checkStatus = useCallback(async () => {
    try {
      const r = await api.get('/chat/status')
      setLlmStatus(r.data)
      if (r.data.available && messages.length === 0) {
        setMessages([{
          role: 'ai',
          text: `Hi! I'm Optima AI powered by ${r.data.provider} (${r.data.model}).\n\nI have live access to your asset data. Ask me anything about licenses, hardware, costs, CMDB, or anomalies.`,
        }])
      }
    } catch {
      setLlmStatus({ available: false, message: 'Could not connect to backend.' })
      if (messages.length === 0) {
        setMessages([{ role: 'error', text: 'Could not connect to Optima backend. Make sure the server is running on port 5000.' }])
      }
    }
  }, [messages.length])

  useEffect(() => {
    if (open && llmStatus === null) checkStatus()
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, open])

  const send = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setShowPrompts(false)

    const userMsg = { role: 'user', text: msg }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setLoading(true)

    try {
      // Send only the last 10 messages for context (avoid token overflow)
      const contextMessages = updatedMessages.slice(-10).map(m => ({
        role: m.role === 'ai' ? 'assistant' : m.role === 'error' ? 'assistant' : m.role,
        content: m.text,
      }))

      const r = await api.post('/chat', { messages: contextMessages })
      setMessages(prev => [...prev, { role: 'ai', text: r.data.reply }])
    } catch (err) {
      const errData = err.response?.data
      let errText = ''
      if (errData?.error === 'no_llm') {
        errText = `⚠️ No local LLM detected.\n\n${errData.message}`
        setLlmStatus({ available: false, message: errData.message })
      } else if (errData?.error === 'timeout') {
        errText = `⏱️ ${errData.message}`
      } else {
        errText = `❌ ${errData?.message || err.message || 'Unknown error'}`
      }
      setMessages(prev => [...prev, { role: 'error', text: errText }])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([])
    setShowPrompts(true)
    setLlmStatus(null)
    checkStatus()
  }

  const StatusBadge = () => {
    if (!llmStatus) return <span className="text-xs text-gray-500">Connecting…</span>
    if (!llmStatus.available) return <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={10} /> No LLM</span>
    return (
      <span className="text-xs text-green-400 flex items-center gap-1">
        <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
        {llmStatus.model}
      </span>
    )
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-5 w-[340px] bg-[#13131a] border border-[#2a2a35] rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden"
          style={{ height: '500px' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#1a1a1f] border-b border-[#2a2a35] flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
                <Sparkles size={13} className="text-white" />
              </div>
              <div>
                <span className="text-sm font-semibold text-white">Optima AI</span>
                <div className="mt-0"><StatusBadge /></div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearChat} title="New conversation" className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[#22222e] transition-colors">
                <RefreshCw size={13} />
              </button>
              <button onClick={() => { setOpen(false); setMessages([]); setShowPrompts(true); setLlmStatus(null); }} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[#22222e] transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* LLM offline banner */}
          {llmStatus && !llmStatus.available && (
            <div className="px-3 py-2 bg-amber-900/20 border-b border-amber-800/30 flex-shrink-0">
              <p className="text-xs text-amber-300 font-medium flex items-center gap-1.5 mb-1"><AlertCircle size={12} /> Local LLM not running</p>
              <p className="text-xs text-amber-400/70">Install <strong>Ollama</strong> at ollama.ai then run:</p>
              <code className="text-xs text-amber-300 bg-black/30 px-1.5 py-0.5 rounded block mt-1">ollama pull llama3.2</code>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((m, i) => <Message key={i} msg={m} />)}
            {loading && <TypingIndicator />}

            {/* Quick prompts — shown when chat is fresh */}
            {showPrompts && messages.length <= 1 && !loading && (
              <div className="pt-1">
                <p className="text-xs text-gray-600 mb-2">Suggested questions:</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map(p => (
                    <button key={p} onClick={() => send(p)}
                      className="text-xs px-2.5 py-1.5 bg-[#1e1e28] border border-[#3a3a4a] text-gray-400 hover:text-blue-400 hover:border-blue-700 rounded-lg transition-colors text-left">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 px-3 py-3 border-t border-[#2a2a35] flex-shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              className="flex-1 px-3 py-2 bg-[#1a1a1f] border border-[#3a3a4a] text-gray-200 text-xs rounded-lg outline-none focus:border-blue-600 placeholder-gray-600 transition-colors"
              placeholder={loading ? 'Thinking…' : 'Ask anything about your assets…'}
              disabled={loading}
            />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg transition-colors flex-shrink-0">
              {loading ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
        </div>
      )}

      {/* Floating toggle button */}
      <button onClick={() => { if (open) { setMessages([]); setShowPrompts(true); setLlmStatus(null); } setOpen(o => !o); }}
        className="fixed bottom-5 right-5 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl shadow-blue-600/40 flex items-center justify-center transition-all z-50 hover:scale-105 active:scale-95">
        {open ? <X size={20} /> : <Bot size={20} />}
        {/* Pulse indicator */}
        {!open && <span className="absolute top-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0e0e12]" />}
      </button>
    </>
  )
}
