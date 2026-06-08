import GameBoard from './components/GameBoard'
import { usePeerGame } from './net/usePeerGame'
import './App.css'

function App() {
  const game = usePeerGame()

  return (
    <div className="app">
      <GameBoard
        gameState={game.gameState}
        mySeat={game.mySeat}
        dispatch={game.dispatch}
        mode={game.mode}
        roomCode={game.mode === 'host' ? game.roomCode : null}
        connectedSeats={game.connectedSeats}
        playerNames={game.playerNames}
        status={game.status}
        onNewGame={game.isHost ? game.resetGame : undefined}
        onCreateGame={game.createGame}
        onJoinGame={game.joinGame}
        onLeaveNetwork={game.startSingle}
      />
    </div>
  )
}

export default App
