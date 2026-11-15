import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import GlobePreview from './GlobePreview.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode><GlobePreview /></StrictMode>,
)
