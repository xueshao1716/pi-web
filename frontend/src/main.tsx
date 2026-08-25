import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Tooltip from '@radix-ui/react-tooltip'
import 'virtual:uno.css'
import './styles.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Tooltip.Provider delayDuration={250} skipDelayDuration={300}>
      <App />
    </Tooltip.Provider>
  </React.StrictMode>,
)
