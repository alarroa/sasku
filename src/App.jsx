import GameBoard from './components/GameBoard'
import Lobby from './components/Lobby'
import { usePeerGame } from './net/usePeerGame'
import './App.css'

function App() {
  const game = usePeerGame()

  return (
    <div className="app">
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
          onNewGame={game.isHost ? game.resetGame : undefined}
          onLeaveToMenu={game.leaveToMenu}
        />
      )}
    </div>
  )
}

export default App
