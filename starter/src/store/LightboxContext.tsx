import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Photo } from '../types'

// 全局共享灯箱：任意页面（/work 网格、系列详情、首页精选）打开的都是同一个 Lightbox。
// 导航范围由调用方传入的 photos 数组决定 —— 在筛选态下打开时，photos 即筛选后的子集，
// 从而保证「灯箱导航只在当前筛选结果内循环」（约束 #2）。
type LightboxState = {
  photos: Photo[]
  index: number
}

type LightboxContextType = {
  state: LightboxState | null
  open: (photos: Photo[], index: number) => void
  close: () => void
  next: () => void
  prev: () => void
}

const LightboxContext = createContext<LightboxContextType | null>(null)

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LightboxState | null>(null)

  const open = useCallback((photos: Photo[], index: number) => {
    setState({ photos, index })
  }, [])

  const close = useCallback(() => setState(null), [])

  const next = useCallback(() => {
    setState(prev => {
      if (!prev) return prev
      return { ...prev, index: (prev.index + 1) % prev.photos.length }
    })
  }, [])

  const prev = useCallback(() => {
    setState(prev => {
      if (!prev) return prev
      return { ...prev, index: (prev.index - 1 + prev.photos.length) % prev.photos.length }
    })
  }, [])

  return (
    <LightboxContext.Provider value={{ state, open, close, next, prev }}>
      {children}
    </LightboxContext.Provider>
  )
}

export function useLightbox(): LightboxContextType {
  const ctx = useContext(LightboxContext)
  if (!ctx) throw new Error('useLightbox 必须在 <LightboxProvider> 内使用')
  return ctx
}
