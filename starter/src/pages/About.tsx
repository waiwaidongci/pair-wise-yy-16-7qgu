import Layout from '../components/Layout'

const TIMELINE = [
  { year: '2016', text: '开始独立摄影，以黑白人像特写起步，形成「凝视」系列。' },
  { year: '2019', text: '首次进入高原，拍摄风光与牧场生活，陆续完成「无人之境」「高原牧歌」。' },
  { year: '2022', text: '于多地举办同名个展，出版摄影集《凝视》。' },
  { year: '2025', text: '持续在高原与驻地之间往返，记录土地与人的日常节奏。' },
]

export default function About() {
  return (
    <Layout>
      <section className="about">
        <div className="section-head">
          <p className="eyebrow">关于</p>
          <h2>摄影师</h2>
          <div className="gold-rule" />
        </div>

        <div className="about-body">
          <div className="about-portrait">
            <div className="ratio-box" style={{ aspectRatio: '3 / 4' }}>
              <img
                src="/photos/portrait/portrait-01.jpg"
                alt="黑白半脸特写，女性侧脸"
                loading="lazy"
                width={4067}
                height={6000}
              />
            </div>
          </div>

          <div className="about-text">
            <p className="about-lede">
              林屿，独立摄影师。拍摄黑白人像特写，以及高原地区的自然风光与牧场生活。
            </p>
            <p>
              她的工作方式是慢的——在同一个地方停留足够久，等光线、也等被拍摄者忘记镜头。
              人像系列《凝视》聚焦眼神与皮肤纹理，探讨镜头前的坦露与防备；
              风光系列《无人之境》记录高海拔无人区的山脊、草甸与雾气；
              牧场系列《高原牧歌》则回到牛群与人，记录游牧生活的日常节奏。
            </p>
            <p>
              作品曾于多地展出，并出版摄影集。她接受编辑与委托拍摄，也持续进行个人项目。
            </p>

            <h3 className="timeline-title">经历</h3>
            <ul className="timeline">
              {TIMELINE.map(item => (
                <li key={item.year}>
                  <span className="timeline-year">{item.year}</span>
                  <span className="timeline-text">{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </Layout>
  )
}
