import GameBoard from './components/GameBoard'
import Lobby from './components/Lobby'
import { usePeerGame } from './net/usePeerGame'
import { et } from './i18n/et'
import './App.css'

function App() {
  const game = usePeerGame()

  // Menu
  if (game.mode === 'menu') {
    return (
      <div className="app">
        <Lobby
          onSingle={game.startSingle}
          onHost={game.createGame}
          onJoin={game.joinGame}
          status={game.status}
          savedCode={game.savedCode}
        />
      </div>
    )
  }

  // Connecting / reconnecting (no game state yet — e.g. client awaiting host)
  if (!game.gameState) {
    const label = game.status === 'reconnecting' ? et.lobby.reconnecting : et.lobby.connecting
    return (
      <div className="app">
        <div className="connecting-screen">
          <div className="connecting-spinner" aria-hidden="true" />
          <p>{label}{game.roomCode ? ` — ${game.roomCode}` : ''}</p>
          <button className="lobby-button" onClick={game.leaveToMenu}>{et.lobby.menu}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <GameBoard
        gameState={game.gameState}
        mySeat={game.mySeat}
        dispatch={game.dispatch}
        roomCode={game.mode === 'host' ? game.roomCode : null}
        connectedSeats={game.connectedSeats}
        heldSeats={game.heldSeats}
        status={game.status}
        onNewGame={game.isHost ? game.resetGame : undefined}
        onLeaveToMenu={game.leaveToMenu}
      />
    </div>
  )
}

export default App
