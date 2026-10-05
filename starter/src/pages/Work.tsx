import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  photoData,
  photosByCategory,
  seriesById,
} from '../data/photos'
import { PhotoButton } from '../components/PhotoButton'
import { useAppStore } from '../store/appStore'

const FILTERS = [
  { id: 'all', label: '全部' },
  ...photoData.categories.map(c => ({ id: c.id, label: c.label })),
]

export default function Work() {
  const { activeCategory, setActiveCategory } = useAppStore()
  // 筛选状态来自路由之外的 store：进入系列页再返回仍保留。
  const photos = useMemo(() => photosByCategory(activeCategory), [activeCategory])

  return (
    <div className="container">
      <section className="work-head">
        <p className="eyebrow">Selected Works · 2016–2025</p>
        <h1>作品总览</h1>
        <p>
          十四张照片，三个系列。光从人脸滑到山脊，又落回牧场的牛群身上——
          按分类筛选，或进入任一系列阅读完整的叙事顺序。
        </p>
      </section>

      <div className="filters" role="group" aria-label="按分类筛选照片">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            aria-pressed={activeCategory === f.id}
            onClick={() => setActiveCategory(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="result-note" aria-live="polite">
        {activeCategory === 'all'
          ? `全部照片 · ${photos.length} 张`
          : `${photoData.categories.find(c => c.id === activeCategory)?.label} · ${photos.length} 张`}
        {activeCategory !== 'all' && seriesById(activeCategory) === undefined && (
          <>
            {' · '}
            <Link to={`/work/${photoData.series.find(s => s.category === activeCategory)?.id}`}>
              阅读《{photoData.series.find(s => s.category === activeCategory)?.title}》
            </Link>
          </>
        )}
      </p>

      <div className="masonry">
        {photos.map((photo, i) => (
          <PhotoButton key={photo.id} photos={photos} index={i} />
        ))}
      </div>
    </div>
  )
}
