import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Photo } from '../data/photos'

// ---------------------------------------------------------------------------
// 灯箱：全站唯一一个 Lightbox 实例由该 store 驱动。
// 任何页面打开灯箱时，必须把「当前可见的照片列表」一并传入，
// 这样上一张/下一张导航的范围就严格限定在调用方的上下文里
// （/work 传入筛选结果、系列页传入该系列的叙事顺序、首页传入精选集合）。
// ---------------------------------------------------------------------------

interface LightboxState {
  photos: Photo[]
  index: number
}

interface AppStoreValue {
  // 作品筛选（提升到路由之外，导航往返时保持）
  activeCategory: string
  setActiveCategory: (category: string) => void

  // 灯箱
  lightbox: LightboxState | null
  openLightbox: (photos: Photo[], startIndex: number) => void
  closeLightbox: () => void
  showPrev: () => void
  showNext: () => void
}

const AppStoreContext = createContext<AppStoreValue | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)

  const openLightbox = useCallback((photos: Photo[], startIndex: number) => {
    if (photos.length === 0) return
    setLightbox({ photos, index: Math.max(0, Math.min(startIndex, photos.length - 1)) })
  }, [])

  const closeLightbox = useCallback(() => setLightbox(null), [])

  const showPrev = useCallback(() => {
    setLightbox(prev =>
      prev
        ? { ...prev, index: (prev.index - 1 + prev.photos.length) % prev.photos.length }
        : prev,
    )
  }, [])

  const showNext = useCallback(() => {
    setLightbox(prev =>
      prev ? { ...prev, index: (prev.index + 1) % prev.photos.length } : prev,
    )
  }, [])

  const value = useMemo<AppStoreValue>(
    () => ({
      activeCategory,
      setActiveCategory,
      lightbox,
      openLightbox,
      closeLightbox,
      showPrev,
      showNext,
    }),
    [activeCategory, lightbox, openLightbox, closeLightbox, showPrev, showNext],
  )

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export function useAppStore(): AppStoreValue {
  const ctx = useContext(AppStoreContext)
  if (!ctx) throw new Error('useAppStore 必须在 <AppStoreProvider> 内使用')
  return ctx
}
