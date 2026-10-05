import { useEffect } from 'react'
import { useLightbox } from '../store/LightboxContext'
import { categoryLabel, photoSrc } from '../data'

// 全局共享灯箱：在 App 根层渲染一次，/work 网格、系列详情、首页精选共用同一个。
// 导航范围由 LightboxContext 中当前 photos 数组决定（筛选态下即为筛选子集）。
export default function Lightbox() {
  const { state, close, next, prev } = useLightbox()

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [state, close, next, prev])

  if (!state) return null
  const { photos, index } = state
  const photo = photos[index]
  if (!photo) return null

  return (
    <div className="lightbox-backdrop" onClick={close}>
      <div
        className="lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={`灯箱：${photo.title}`}
        onClick={e => e.stopPropagation()}
      >
        <button className="lightbox-close" type="button" onClick={close} aria-label="关闭">
          关闭
        </button>

        <div className="lightbox-stage">
          <button
            className="lightbox-nav lightbox-prev"
            type="button"
            onClick={prev}
            aria-label="上一张"
          >
            ‹
          </button>

          <figure className="lightbox-figure">
            <img
              className="lightbox-image"
              src={photoSrc(photo)}
              alt={photo.altText}
              width={photo.width}
              height={photo.height}
            />
          </figure>

          <button
            className="lightbox-nav lightbox-next"
            type="button"
            onClick={next}
            aria-label="下一张"
          >
            ›
          </button>
        </div>

        <aside className="lightbox-info">
          <p className="eyebrow">
            {categoryLabel(photo.category)} · {index + 1} / {photos.length}
          </p>
          <h2>{photo.title}</h2>
          <p className="lightbox-caption">{photo.caption}</p>
        </aside>
      </div>
    </div>
  )
}
