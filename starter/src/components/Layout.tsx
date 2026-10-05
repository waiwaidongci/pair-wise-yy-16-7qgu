import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: '首页', end: true },
  { to: '/work', label: '作品', end: false },
  { to: '/about', label: '关于', end: false },
  { to: '/contact', label: '联系', end: false },
]

export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // 路由切换后收起移动菜单
  const onNavClick = () => setOpen(false)

  return (
    <div className="site">
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand" onClick={onNavClick}>
            <span className="brand-mark">摄</span>
            <span className="brand-text">
              <strong>摄影师作品集</strong>
              <em>PHOTOGRAPHER PORTFOLIO</em>
            </span>
          </Link>

          <button
            type="button"
            className="menu"
            aria-label="切换菜单"
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
          >
            <span />
            <span />
            <span />
          </button>

          <nav className={`site-nav ${open ? 'open' : ''}`}>
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? 'active' : '')}
                onClick={onNavClick}
              >
                {item.label}
              </NavLink>
            ))}
            <NavLink
              to="/console"
              className={({ isActive }) => (isActive ? 'active console-link' : 'console-link')}
              onClick={onNavClick}
            >
              策展发布台
            </NavLink>
          </nav>
        </div>
      </header>

      <main key={location.pathname} className="site-main">
        {children}
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <strong>摄影师作品集</strong>
            <p>黑白人像 · 高原风光 · 牧野生活</p>
          </div>
          <div className="footer-links">
            <Link to="/work">作品</Link>
            <Link to="/about">关于</Link>
            <Link to="/contact">联系</Link>
            <Link to="/console">策展发布台</Link>
          </div>
          <p className="footer-copy">© {new Date().getFullYear()} 摄影师作品集 · 本地离线演示</p>
        </div>
      </footer>
    </div>
  )
}
