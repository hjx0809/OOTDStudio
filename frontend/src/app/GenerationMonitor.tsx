import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/AuthProvider'
import { useToast } from '@/app/ToastProvider'
import { ApiError } from '@/lib/api'
import { clearGeneration, useActiveGeneration } from '@/lib/generation'
import { queryKeys, useRecommendation } from '@/lib/queries'

/**
 * Keeps a generation's status polled from anywhere in the app.
 *
 * The server renders in the background, so leaving the looks page must not
 * stop updates or hide the result. This component owns that polling and tells
 * the user when the work finishes, wherever they are.
 */
export function GenerationMonitor() {
  const active = useActiveGeneration()
  const { user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()
  const location = useLocation()
  const handled = useRef<string | null>(null)
  const query = useRecommendation(user ? active?.id : undefined)
  const data = query.data
  const error = query.error

  useEffect(() => {
    if (!active) {
      handled.current = null
      return
    }
    if (error) {
      if (error instanceof ApiError && error.status === 404) {
        clearGeneration(active.id)
      }
      return
    }
    if (!data || data.id !== active.id || !data.is_complete) return
    if (handled.current === active.id) return
    handled.current = active.id

    const onLooksPage = location.pathname === `/looks/${active.id}`
    const ready = data.outfits.filter((outfit) => outfit.image_status === 'ready').length
    if (!onLooksPage) {
      if (data.status === 'failed') {
        toast.error('造型没有生成成功', '回到造型页再试一次吧。')
      } else if (data.status === 'wardrobe_gap' || data.outfits.length === 0) {
        toast.toast({
          title: '衣橱还差几件单品',
          description: '看看缺什么，补齐后造型会更完整。',
        })
      } else if (active.kind === 'render') {
        toast.success('试穿图更新好了', '可以回去看看新的背景。')
      } else {
        toast.success(
          '明天的造型准备好了',
          `${data.outfits.length} 套造型${ready ? `，${ready} 张试穿图` : ''}。`,
        )
      }
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.history })
    clearGeneration(active.id)
  }, [active, data, error, location.pathname, toast, queryClient])

  return null
}
