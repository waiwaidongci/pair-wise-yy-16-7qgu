import type { Photo } from '../types'
import { categoryLabel, photoSrc } from '../data'

// 照片卡片：.ratio-box 在图片加载前即按 photos.json 的真实宽高撑开比例（约束 #3），
// 避免布局抖动（CLS）。aspect-ratio 由数据 width/height 派生。
export default function PhotoCard({ photo, onClick }: { photo: Photo; onClick: () => void }) {
  return (
    <button type="button" className="photo-button" onClick={onClick}>
      <div
        className="ratio-box"
        style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
      >
        <img
          src={photoSrc(photo)}
          alt={photo.altText}
          loading="lazy"
          width={photo.width}
          height={photo.height}
        />
      </div>
      <div className="photo-meta">
        <strong>{photo.title}</strong>
        <span aria-hidden="true">{categoryLabel(photo.category)}</span>
      </div>
    </button>
  )
}
