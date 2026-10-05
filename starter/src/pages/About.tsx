const TIMELINE = [
  {
    year: '2014',
    title: '从城市报道出走',
    text: '结束五年的城市新闻摄影，第一次带着一台旁轴相机进入川西高原，在牧场住了四十天。',
  },
  {
    year: '2016',
    title: '《凝视》开始',
    text: '回到工作室，用一支 85mm 镜头记录身边愿意长时间坐在镜头前的人。只保留黑白。',
  },
  {
    year: '2019',
    title: '《无人之境》的四个季节',
    text: '在同一道山脊上往返四季，等待雾、云与低角度的光以同样的构图重新排列。',
  },
  {
    year: '2022',
    title: '游牧者的许可',
    text: '经三户牧民家庭允许，跟随夏季转场路线完成《高原牧歌》，牛群成为画面里唯一不急的事物。',
  },
  {
    year: '2025',
    title: '正在继续',
    text: '三个系列仍在更新。她相信一个题材至少需要十年，才配被叫作完成。',
  },
]

export default function About() {
  return (
    <div className="container">
      <section className="about-hero">
        <p className="eyebrow">About · 关于</p>
        <h1>我只是替光按下快门的那个人。</h1>
        <p className="bio">
          林昭，1989 年生，现居成都与高原之间。她的作品长期关注两类对象：
          人在镜头前无法伪装的那几秒，以及没有人的地貌里缓慢发生的事。
          照片曾在成都、昆明与阿尔勒的小型展映中出现，但她更在意的，
          是那些从未被展出、只是安静留在牧民家中的照片。
        </p>
        <hr className="gold-rule" />
      </section>

      <ul className="timeline">
        {TIMELINE.map(item => (
          <li key={item.year}>
            <span className="year">{item.year}</span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
