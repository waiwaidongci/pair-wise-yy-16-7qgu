import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import { useLightbox } from '../store/LightboxContext'
import { seriesList, photosForSeries, photoSrc } from '../data'

export default function Home() {
  const { open } = useLightbox()

  return (
    <Layout>
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">独立摄影师 · 作品集</p>
          <h1>
            以镜头为笔，
            <br />
            记录光影与土地
          </h1>
          <p className="hero-lede">
            拍摄黑白人像特写，以及高原地区的自然风光与牧场生活。
            三个系列，是三种观看世界的方式。
          </p>
          <div className="hero-actions">
            <Link to="/work" className="btn btn-primary">
              浏览作品
            </Link>
            <Link to="/contact" className="btn btn-ghost">
              联系我
            </Link>
          </div>
        </div>
      </section>

      <section className="series-preview">
        <div className="section-head">
          <p className="eyebrow">系列</p>
          <h2>三个系列</h2>
          <div className="gold-rule" />
        </div>

        <div className="series-cards">
          {seriesList.map(series => {
            const seriesPhotos = photosForSeries(series.id)
            const cover = seriesPhotos[0]
            return (
              <article
                key={series.id}
                className="series-card"
                onClick={() => open(seriesPhotos, 0)}
              >
                <div className="series-card-media">
                  <img
                    src={photoSrc(cover)}
                    alt={cover.altText}
                    loading="lazy"
                    width={cover.width}
                    height={cover.height}
                  />
                  <span className="series-card-cover">精选预览</span>
                </div>
                <div className="series-card-body">
                  <p className="eyebrow">系列 · {seriesPhotos.length} 张</p>
                  <h3>{series.title}</h3>
                  <p>{series.summary}</p>
                  <Link
                    to={`/work/${series.id}`}
                    className="series-enter"
                    onClick={e => e.stopPropagation()}
                  >
                    进入系列 →
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </Layout>
  )
}
