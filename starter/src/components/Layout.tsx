import { useState, type ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Lightbox } from './Lightbox'

const NAV_ITEMS = [
  { to: '/', label: '首页', end: true },
  { to: '/work', label: '作品' },
  { to: '/about', label: '关于' },
  { to: '/contact', label: '联系' },
]

function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          林昭 <span>·</span> LIN ZHAO
        </Link>
        <nav className={`nav ${open ? 'open' : ''}`} aria-label="主导航">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="menu"
          aria-label="打开菜单"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          <span />
        </button>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <p className="brand">林昭 · LIN ZHAO</p>
          <p>所有影像均拍摄于海拔三千米以上的旷野，与城市之间的一面镜子。</p>
        </div>
        <div className="footer-links">
          <Link to="/work">作品</Link>
          <Link to="/contact">联系</Link>
          <Link to="/studio">策展发布台</Link>
        </div>
      </div>
    </footer>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
      <Lightbox />
    </>
  )
}
