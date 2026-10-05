import { Link, useParams } from 'react-router-dom'
import {
  seriesById,
  photosBySeries,
  categoryLabel,
} from '../data/photos'
import { PhotoButton } from '../components/PhotoButton'

export default function SeriesPage() {
  const { seriesId } = useParams<{ seriesId: string }>()
  const series = seriesId ? seriesById(seriesId) : undefined

  if (!series) {
    return (
      <div className="container" style={{ padding: '120px 0' }}>
        <h1>没有找到这个系列</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>
          <Link to="/work" className="story-back">← 返回作品总览</Link>
        </p>
      </div>
    )
  }

  // 与 /work 完全同源：按 seriesId 从 photos.json 派生、按 order 排序，禁止另写一份。
  const photos = photosBySeries(series.id)

  return (
    <>
      <section className="story-head">
        <div className="container">
          <p className="eyebrow">
            {categoryLabel(series.category)} · {photos.length} 张照片
          </p>
          <h1>{series.title}</h1>
          <p className="pull-quote">{series.summary}</p>
          <hr className="gold-rule" />
        </div>
      </section>

      <div className="container">
        <div className="story">
          {photos.map((photo, i) => (
            <article key={photo.id}>
              <div className="story-media">
                {/* 灯箱范围显式限定为本系列叙事顺序 */}
                <PhotoButton photos={photos} index={i} showCategory={false} />
              </div>
              <div className="story-text">
                <span className="index-tag">
                  {String(i + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}
                </span>
                <h2>{photo.title}</h2>
                <p>{photo.caption}</p>
              </div>
            </article>
          ))}
          <Link to="/work" className="story-back">
            ← 返回作品总览
          </Link>
        </div>
      </div>
    </>
  )
}
