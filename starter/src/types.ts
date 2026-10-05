// 共享数据类型 — 与 mock-data/photos.json 结构保持一致
export type CategoryId = 'portrait' | 'landscape' | 'pastoral'

export type Photo = {
  id: string
  category: CategoryId
  seriesId: string
  file: string
  title: string
  altText: string
  caption: string
  width: number
  height: number
  order: number
}

export type Series = {
  id: string
  title: string
  category: CategoryId
  summary: string
  photoIds: string[]
}

export type PhotoData = {
  categories: { id: CategoryId; label: string }[]
  series: Series[]
  photos: Photo[]
}
