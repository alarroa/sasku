import { useState } from 'react'
import GameBoard from './components/GameBoard'
import './App.css'

const STORAGE_KEY = 'sasku-game-state'

function App() {
  const [resetKey, setResetKey] = useState(0)

  const handleNewGame = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear game state:', error)
    }
    setResetKey(prev => prev + 1)
  }

  return (
    <div className="app">
      <GameBoard key={resetKey} onNewGame={handleNewGame} />
    </div>
  )
}

export default App
