import { Link } from 'react-router-dom'
import {
  seriesList,
  photosBySeries,
  coverPhotoForSeries,
  categoryLabel,
} from '../data/photos'
import { SmartImage } from '../components/SmartImage'
import { useAppStore } from '../store/appStore'

export default function Home() {
  const { openLightbox } = useAppStore()

  return (
    <>
      <section className="hero">
        <div className="container">
          <p className="eyebrow">Photography · Since 2014</p>
          <h1>
            在旷野里等待光，
            <br />
            在<em>人脸</em>上遇见它。
          </h1>
          <p className="lede">
            林昭，独立摄影师。她的镜头只对准两件事：高原无人区里缓慢移动的四季，
            以及人在被观看瞬间来不及收起的神情。这里收录三个长期系列——
            黑白人像《凝视》、高原风光《无人之境》与牧场生活《高原牧歌》。
          </p>
          <hr className="gold-rule" />
        </div>
      </section>

      <section className="series-preview">
        <div className="container">
          <div className="section-head">
            <h2>三个正在继续的系列</h2>
          </div>
          <div className="series-grid">
            {seriesList.map(series => {
              const cover = coverPhotoForSeries(series.id)
              const photos = photosBySeries(series.id)
              const coverIndex = photos.findIndex(p => p.id === cover.id)
              return (
                <div className="series-card" key={series.id}>
                  <button
                    type="button"
                    className="cover"
                    style={{ padding: 0, border: 0, background: 'none', width: '100%' }}
                    aria-label={`在灯箱中打开《${series.title}》的封面`}
                    onClick={() => openLightbox(photos, coverIndex)}
                  >
                    <SmartImage photo={cover} />
                  </button>
                  <div className="card-body">
                    <p className="eyebrow">{categoryLabel(series.category)}</p>
                    <h3>{series.title}</h3>
                    <p>{series.summary}</p>
                    <Link to={`/work/${series.id}`} className="card-link">
                      进入系列 →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </>
  )
}
