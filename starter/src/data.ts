import data from './data/photos.json'
import type { PhotoData, Photo, Series, CategoryId } from './types'

// 权威内容数据源：mock-data/photos.json 的拷贝（构建期打包）。
// 全站照片、标题、说明、尺寸均由此派生，禁止在组件中重复硬编码。
export const photoData = data as PhotoData

export const photos: Photo[] = photoData.photos
export const seriesList: Series[] = photoData.series
export const categories = photoData.categories

export function photosForCategory(category: CategoryId | 'all'): Photo[] {
  if (category === 'all') return [...photos].sort((a, b) => a.order - b.order)
  return photos
    .filter(p => p.category === category)
    .sort((a, b) => a.order - b.order)
}

export function photosForSeries(seriesId: string): Photo[] {
  return photos
    .filter(p => p.seriesId === seriesId)
    .sort((a, b) => a.order - b.order)
}

export function seriesById(seriesId: string): Series | undefined {
  return seriesList.find(s => s.id === seriesId)
}

export function seriesByCategory(category: CategoryId): Series | undefined {
  return seriesList.find(s => s.category === category)
}

export function categoryLabel(category: CategoryId): string {
  return categories.find(c => c.id === category)?.label ?? category
}

// 照片资源路径：mock-data/photos/<category>/<file> 拷贝到 public/photos 下
export function photoSrc(photo: Photo): string {
  return `/photos/${photo.file}`
}
