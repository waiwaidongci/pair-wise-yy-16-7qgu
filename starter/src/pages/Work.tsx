import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import PhotoGrid from '../components/PhotoGrid'
import { useLightbox } from '../store/LightboxContext'
import { useFilter, type FilterValue } from '../store/FilterContext'
import { photosForCategory, categories, seriesByCategory } from '../data'
import type { CategoryId } from '../types'

const FILTERS: { id: FilterValue; label: string }[] = [
  { id: 'all', label: '全部' },
  ...categories.map(c => ({ id: c.id as CategoryId, label: c.label })),
]

export default function Work() {
  const { category, setCategory } = useFilter()
  const { open } = useLightbox()

  const filtered = useMemo(() => photosForCategory(category), [category])
  const activeSeries = category !== 'all' ? seriesByCategory(category as CategoryId) : undefined

  return (
    <Layout>
      <section className="work">
        <div className="section-head">
          <p className="eyebrow">作品集</p>
          <h2>全部作品</h2>
          <div className="gold-rule" />
        </div>

        <div className="filters" role="group" aria-label="按分类筛选">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              className={category === f.id ? 'active' : ''}
              aria-pressed={category === f.id}
              onClick={() => setCategory(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <p className="filter-count">当前展示 {filtered.length} 张</p>

        {activeSeries && (
          <Link to={`/work/${activeSeries.id}`} className="series-link-banner">
            <span className="eyebrow">进入系列</span>
            <strong>「{activeSeries.title}」</strong>
            <span className="series-link-arrow">→</span>
          </Link>
        )}

        <PhotoGrid photos={filtered} onOpen={(_photo, index) => open(filtered, index)} />
      </section>
    </Layout>
  )
}
