import type { Photo } from '../types'
import PhotoCard from './PhotoCard'

// 照片网格：/work 与系列详情共用。列数由 CSS 响应式控制（桌面多列、移动单列）。
export default function PhotoGrid({
  photos,
  onOpen,
}: {
  photos: Photo[]
  onOpen: (photo: Photo, index: number) => void
}) {
  return (
    <div className="photo-grid">
      {photos.map((photo, i) => (
        <PhotoCard key={photo.id} photo={photo} onClick={() => onOpen(photo, i)} />
      ))}
    </div>
  )
}
