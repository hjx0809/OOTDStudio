import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'

type ToastTone = 'default' | 'success' | 'error'

interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
}

interface ToastItem extends ToastInput {
  id: string
}

interface ToastContextValue {
  toast: (input: ToastInput) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const toast = useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID()
      setItems((current) => [...current.slice(-2), { ...input, id }])
      const timer = window.setTimeout(() => dismiss(id), 4400)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  useEffect(() => {
    const currentTimers = timers.current
    return () => {
      currentTimers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: 'success' }),
      error: (title, description) => toast({ title, description, tone: 'error' }),
    }),
    [toast],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="o-toast-stack" aria-live="polite" aria-atomic="false">
          {items.map((item) => (
            <div key={item.id} className={`o-toast o-toast--${item.tone ?? 'default'}`}>
              <span className="o-toast__icon" aria-hidden="true">
                {item.tone === 'success' ? (
                  <CircleCheck size={18} />
                ) : item.tone === 'error' ? (
                  <CircleAlert size={18} />
                ) : (
                  <Info size={18} />
                )}
              </span>
              <div className="o-toast__content">
                <p className="o-toast__title">{item.title}</p>
                {item.description && (
                  <p className="o-toast__description">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                className="o-toast__close"
                onClick={() => dismiss(item.id)}
                aria-label="关闭提示"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
