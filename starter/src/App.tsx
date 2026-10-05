import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { LightboxProvider } from './store/LightboxContext'
import { FilterProvider } from './store/FilterContext'
import Lightbox from './components/Lightbox'
import Home from './pages/Home'
import Work from './pages/Work'
import Series from './pages/Series'
import About from './pages/About'
import Contact from './pages/Contact'
import ConsolePage from './console/Console'

export default function App() {
  return (
    <BrowserRouter>
      <LightboxProvider>
        <FilterProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/work" element={<Work />} />
            <Route path="/work/:seriesId" element={<Series />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/console" element={<ConsolePage />} />
            <Route path="*" element={<Home />} />
          </Routes>
          <Lightbox />
        </FilterProvider>
      </LightboxProvider>
    </BrowserRouter>
  )
}
