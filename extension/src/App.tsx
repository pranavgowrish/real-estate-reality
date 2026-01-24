// import { useState } from 'react'
// import reactLogo from './assets/react.svg'
// import viteLogo from '/vite.svg'
import './App.css'
import EmergencyServicesPage from './emergencyServices/page'

function App() {
  return (
    <div className="app">
      <img src="/rer.png" alt="RER Logo" className="logo" />
      <div className="grades">
        <p>Crime grade: </p>
        <p>Proximity to emergency services grade: <EmergencyServicesPage /> </p>
        <p>Environment/wellness grade: </p>
        
      </div>
    </div>
  )
}

export default App
