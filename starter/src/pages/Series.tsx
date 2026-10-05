import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { useLightbox } from '../store/LightboxContext'
import { seriesById, photosForSeries, photoSrc } from '../data'

// 系列详情页：叙事式长图文。照片、标题、说明均从 photos.json 按 seriesId 派生（约束 #4），
// 与 /work 共用同一份数据模型，不重复硬编码。
export default function Series() {
  const { seriesId } = useParams<{ seriesId: string }>()
  const { open } = useLightbox()

  const series = seriesById(seriesId ?? '')
  if (!series) {
    return (
      <Layout>
        <section className="series-detail">
          <p className="eyebrow">404</p>
          <h2>未找到该系列</h2>
          <Link to="/work" className="btn btn-primary">
            返回作品
          </Link>
        </section>
      </Layout>
    )
  }

  const photos = photosForSeries(series.id)

  return (
    <Layout>
      <section className="series-detail">
        <header className="story-header">
          <p className="eyebrow">系列 · {series.title}</p>
          <h1>{series.title}</h1>
          <blockquote className="story-summary">
            <em>{series.summary}</em>
          </blockquote>
          <div className="gold-rule" />
        </header>

        <div className="story">
          {photos.map((photo, i) => (
            <article key={photo.id} className="story-block">
              <div className="story-text">
                <span className="story-index">{String(i + 1).padStart(2, '0')}</span>
                <h2>{photo.title}</h2>
                <p>{photo.caption}</p>
              </div>
              <button
                type="button"
                className="photo-button story-photo"
                onClick={() => open(photos, i)}
              >
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
              </button>
            </article>
          ))}
        </div>

        <div className="series-back">
          <Link to="/work" className="btn btn-ghost">
            ← 返回全部作品
          </Link>
        </div>
      </section>
    </Layout>
  )
}
