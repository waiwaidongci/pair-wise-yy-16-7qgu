import { useState } from 'react'
import type { Photo } from '../data/photos'

interface SmartImageProps {
  photo: Photo
  sizes?: string
  eager?: boolean
}

/**
 * 按 photos.json 的真实 width/height 用 aspect-ratio 预留占位，
 * 图片在占位容器内 absolute 填充，加载完成前布局已完全撑开（零 CLS）。
 */
export function SmartImage({ photo, eager = false }: SmartImageProps) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div
      className="ratio-box"
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
    >
      <img
        src={`/${photo.file}`}
        alt={photo.altText}
        width={photo.width}
        height={photo.height}
        loading={eager ? 'eager' : 'lazy'}
        onLoad={() => setLoaded(true)}
        className={loaded ? 'loaded' : ''}
      />
    </div>
  )
}
