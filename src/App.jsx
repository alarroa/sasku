import GameBoard from './components/GameBoard'
import { usePeerGame } from './net/usePeerGame'
import { et } from './i18n/et'
import './App.css'

function App() {
  const game = usePeerGame()

  // No game state yet — a networked session is (re)connecting after a refresh
  if (!game.gameState) {
    const label = game.status === 'reconnecting' ? et.lobby.reconnecting : et.lobby.connecting
    return (
      <div className="app">
        <div className="connecting-screen">
          <div className="connecting-spinner" aria-hidden="true" />
          <p>{label}{game.roomCode ? ` — ${game.roomCode}` : ''}</p>
          <button className="lobby-button" onClick={game.startSingle}>{et.lobby.leaveNetwork}</button>
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
        mode={game.mode}
        roomCode={game.mode === 'host' ? game.roomCode : null}
        connectedSeats={game.connectedSeats}
        heldSeats={game.heldSeats}
        playerNames={game.playerNames}
        status={game.status}
        savedCode={game.savedCode}
        onNewGame={game.isHost ? game.resetGame : undefined}
        onCreateGame={game.createGame}
        onJoinGame={game.joinGame}
        onLeaveNetwork={game.startSingle}
      />
    </div>
  )
}

export default App
