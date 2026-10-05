import rawData from './photos.json'

export interface Category {
  id: string
  label: string
}

export interface SeriesMeta {
  id: string
  title: string
  category: string
  summary: string
  photoIds: string[]
}

export interface Photo {
  id: string
  category: string
  seriesId: string
  file: string
  title: string
  altText: string
  caption: string
  width: number
  height: number
  order: number
}

export interface PhotoData {
  categories: Category[]
  series: SeriesMeta[]
  photos: Photo[]
}

// mock-data/photos.json 是唯一权威内容源，全站只通过这里消费数据。
export const photoData = rawData as PhotoData

export const allPhotos: Photo[] = photoData.photos

export const categoryLabel = (id: string): string =>
  photoData.categories.find(c => c.id === id)?.label ?? id

export const seriesList: SeriesMeta[] = photoData.series

export const seriesById = (id: string): SeriesMeta | undefined =>
  photoData.series.find(s => s.id === id)

export const photosByCategory = (category: string): Photo[] =>
  category === 'all' ? allPhotos : allPhotos.filter(p => p.category === category)

export const photosBySeries = (seriesId: string): Photo[] =>
  allPhotos
    .filter(p => p.seriesId === seriesId)
    .sort((a, b) => a.order - b.order)

// 首页精选：每个系列取叙事顺序中的第一张作为封面候选。
export const coverPhotoForSeries = (seriesId: string): Photo =>
  photosBySeries(seriesId)[0]
