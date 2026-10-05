import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { categoryLabel } from '../data/photos'

/**
 * 全局唯一灯箱：挂在布局层一次，任何页面通过 openLightbox(photos, index) 打开。
 * 上一张/下一张只在调用方传入的 photos 范围内循环。
 */
export function Lightbox() {
  const { lightbox, closeLightbox, showPrev, showNext } = useAppStore()

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') showPrev()
      if (e.key === 'ArrowRight') showNext()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [lightbox, closeLightbox, showPrev, showNext])

  if (!lightbox) return null
  const { photos, index } = lightbox
  const photo = photos[index]

  return (
    <div
      className="lightbox-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) closeLightbox()
      }}
    >
      <button className="lightbox-close" aria-label="关闭" onClick={closeLightbox}>
        关闭
      </button>
      <div className="lightbox" role="dialog" aria-modal="true" aria-label={photo.title}>
        <div className="lightbox-stage">
          <button className="lightbox-nav" aria-label="上一张" onClick={showPrev}>
            ‹
          </button>
          <img
            key={photo.id}
            className="lightbox-image"
            src={`/${photo.file}`}
            alt={photo.altText}
            width={photo.width}
            height={photo.height}
          />
          <button className="lightbox-nav" aria-label="下一张" onClick={showNext}>
            ›
          </button>
        </div>
        <div className="lightbox-info">
          <span className="eyebrow">
            {categoryLabel(photo.category)} · {index + 1} / {photos.length}
          </span>
          <h2>{photo.title}</h2>
          <p>{photo.caption}</p>
        </div>
      </div>
    </div>
  )
}
