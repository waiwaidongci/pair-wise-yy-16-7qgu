import { SmartImage } from './SmartImage'
import type { Photo } from '../data/photos'
import { categoryLabel } from '../data/photos'
import { useAppStore } from '../store/appStore'

interface PhotoButtonProps {
  photos: Photo[]
  index: number
  showCategory?: boolean
}

/** 可点击打开全局灯箱的照片单元；灯箱范围由 photos 参数显式限定。 */
export function PhotoButton({ photos, index, showCategory = true }: PhotoButtonProps) {
  const { openLightbox } = useAppStore()
  const photo = photos[index]
  return (
    <button
      type="button"
      className="photo-button"
      onClick={() => openLightbox(photos, index)}
      aria-label={`查看照片：${photo.title}`}
    >
      <SmartImage photo={photo} />
      <span className="photo-meta">
        <strong>{photo.title}</strong>
        {showCategory && <span className="cat">{categoryLabel(photo.category)}</span>}
      </span>
    </button>
  )
}
