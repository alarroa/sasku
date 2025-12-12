import GameBoard from './components/GameBoard'
import { et } from './i18n/et'
import './App.css'

function App() {
  return (
    <div className="app">
      <h1>{et.meta.title}</h1>
      <GameBoard />
    </div>
  )
}

export default App
