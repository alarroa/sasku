import { useState } from 'react'
import GameBoard from './components/GameBoard'
import { et } from './i18n/et'
import './App.css'

const STORAGE_KEY = 'sasku-game-state'

function App() {
  const [resetKey, setResetKey] = useState(0)

  const handleNewGame = () => {
    // Clear localStorage
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear game state:', error)
    }
    // Force GameBoard to remount with fresh state
    setResetKey(prev => prev + 1)
  }

  return (
    <div className="app">
      <header className="app-header">
        <button className="new-game-button" onClick={handleNewGame}>
          {et.gameEnd.newGame}
        </button>
        <h1>{et.meta.title}</h1>
      </header>
      <GameBoard key={resetKey} />
    </div>
  )
}

export default App
