import GameBoard from './components/GameBoard'
import Lobby from './components/Lobby'
import { usePeerGame } from './net/usePeerGame'
import { et } from './i18n/et'
import './App.css'

function App() {
  const game = usePeerGame()

  const renderHeaderActions = () => {
    if (game.mode === 'menu') return null

    return (
      <div className="header-actions">
        {game.mode === 'single' && (
          <button className="new-game-button" onClick={game.resetGame}>
            {et.gameEnd.newGame}
          </button>
        )}
        <button className="new-game-button" onClick={game.leaveToMenu}>
          {et.lobby.menu}
        </button>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        {renderHeaderActions()}
        <h1>{et.meta.title}</h1>
      </header>

      {game.mode === 'menu' ? (
        <Lobby
          onSingle={game.startSingle}
          onHost={game.createGame}
          onJoin={game.joinGame}
          status={game.status}
        />
      ) : (
        <GameBoard
          gameState={game.gameState}
          mySeat={game.mySeat}
          dispatch={game.dispatch}
          roomCode={game.mode === 'host' ? game.roomCode : null}
          connectedSeats={game.connectedSeats}
        />
      )}
    </div>
  )
}

export default App
