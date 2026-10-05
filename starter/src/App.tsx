import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppStoreProvider } from './store/appStore'
import { Layout } from './components/Layout'
import Home from './pages/Home'
import Work from './pages/Work'
import SeriesPage from './pages/SeriesPage'
import About from './pages/About'
import Contact from './pages/Contact'
import StudioPage from './pages/StudioPage'

export default function App() {
  return (
    <AppStoreProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/work" element={<Work />} />
            <Route path="/work/:seriesId" element={<SeriesPage />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AppStoreProvider>
  )
}
