/**
 * EmailSSEContext
 *
 * Provides a shared SSE connection to /api/emails/stream for the entire app.
 * Components subscribe via useEmailSSE() to receive real-time new-email events.
 */
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'

/** Shape of a single SSE email event coming from the backend */
export interface SSEEmailEvent {
  userId: string
  accountId: string
  accountEmail: string
  logId: string
  subject: string
  senderName: string
  senderEmail: string
  toEmail: string
  receivedAt: string
  snippet: string
}

interface EmailSSEContextValue {
  /** All email events received since mount (newest first) */
  recentEvents: SSEEmailEvent[]
  /** Whether the SSE connection is currently open */
  isConnected: boolean
  /** Flush processed events (call after consuming them) */
  clearRecentEvents: () => void
}

const EmailSSEContext = createContext<EmailSSEContextValue>({
  recentEvents: [],
  isConnected: false,
  clearRecentEvents: () => {},
})

const MAX_QUEUED_EVENTS = 50

export function EmailSSEProvider({ enabled = true, children }: { enabled?: boolean; children: React.ReactNode }) {
  const [recentEvents, setRecentEvents] = useState<SSEEmailEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectDelay = useRef(1000)

  const clearRecentEvents = useCallback(() => {
    setRecentEvents([])
  }, [])

  useEffect(() => {
    if (!enabled) {
      setIsConnected(false)
      return
    }

    const token = localStorage.getItem('token')
    if (!token) return

    let disposed = false

    function connect() {
      if (disposed) return

      const es = new EventSource(
        `/api/emails/stream?token=${encodeURIComponent(token!)}`
      )
      esRef.current = es

      es.onopen = () => {
        if (!disposed) {
          setIsConnected(true)
          reconnectDelay.current = 1000 // reset backoff
        }
      }

      es.addEventListener('new_email', (event: MessageEvent) => {
        if (disposed) return
        try {
          const data: SSEEmailEvent = JSON.parse(event.data)
          setRecentEvents(prev => {
            const next = [data, ...prev]
            return next.length > MAX_QUEUED_EVENTS ? next.slice(0, MAX_QUEUED_EVENTS) : next
          })
        } catch (_) { /* ignore malformed events */ }
      })

      es.onerror = () => {
        if (disposed) return
        setIsConnected(false)
        es.close()
        esRef.current = null
        // Exponential backoff reconnect (cap at 30s)
        const delay = reconnectDelay.current
        reconnectDelay.current = Math.min(delay * 2, 30000)
        reconnectTimer.current = setTimeout(connect, delay)
      }
    }

    // Reset backoff when (re)connecting
    reconnectDelay.current = 1000
    connect()

    return () => {
      disposed = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
      setIsConnected(false)
    }
  }, [enabled]) // reconnect when enabled changes (e.g. login/logout)

  return (
    <EmailSSEContext.Provider value={{ recentEvents, isConnected, clearRecentEvents }}>
      {children}
    </EmailSSEContext.Provider>
  )
}

/**
 * Hook for consuming real-time email events.
 *
 * Usage:
 *   const { recentEvents, isConnected, clearRecentEvents } = useEmailSSE()
 */
export function useEmailSSE() {
  return useContext(EmailSSEContext)
}
