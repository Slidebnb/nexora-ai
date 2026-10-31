import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { initLiveBridge } from './lib/liveBridge'

const root = document.getElementById('root')
if (!root) throw new Error('#root fehlt in index.html')

initLiveBridge()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
