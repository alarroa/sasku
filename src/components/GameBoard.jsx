import { useState, useEffect } from 'react';
import Hand from './Hand';
import Card from './Card';
import {
  createInitialState,
  GAME_PHASES,
  canPlayCard,
  playCard,
  makeBid,
  passBid,
  chooseTrump,
  startNewRound,
  getTeam
} from '../game/gameState';
import { makeAIBid, chooseAITrump, chooseAICard } from '../game/ai';
import { SUITS, SUIT_NAMES_ET, calculateBiddingValue } from '../game/cards';
import './GameBoard.css';

const PLAYER_NAMES = ['Sina', 'Mängija 2', 'Partner', 'Mängija 4'];

export default function GameBoard() {
  const [gameState, setGameState] = useState(createInitialState());
  const [message, setMessage] = useState('Uus mäng algas! Pakkumine käib.');

  // AI turn handling
  useEffect(() => {
    if (gameState.currentPlayer === 0) return; // Human player

    const timer = setTimeout(() => {
      const playerIndex = gameState.currentPlayer;

      if (gameState.phase === GAME_PHASES.BIDDING) {
        // Check if this player needs to choose trump
        if (gameState.trumpMaker === playerIndex && !gameState.trumpSuit) {
          const trump = chooseAITrump(gameState, playerIndex);
          setMessage(`${PLAYER_NAMES[playerIndex]} valis trumpiks ${SUIT_NAMES_ET[trump]}`);
          setGameState(chooseTrump(gameState, trump));
        } else {
          const bid = makeAIBid(gameState, playerIndex);
          if (bid !== null) {
            setMessage(`${PLAYER_NAMES[playerIndex]} pakkus ${bid}`);
            setGameState(makeBid(gameState, playerIndex, bid));
          } else {
            setMessage(`${PLAYER_NAMES[playerIndex]} passis`);
            setGameState(passBid(gameState, playerIndex));
          }
        }
      } else if (gameState.phase === GAME_PHASES.PLAYING) {
        const card = chooseAICard(gameState, playerIndex);
        if (card) {
          setMessage(`${PLAYER_NAMES[playerIndex]} mängis kaardi`);
          setGameState(playCard(gameState, playerIndex, card));
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [gameState]);

  const handleBid = (bid) => {
    setMessage(`Sa pakkusid ${bid}`);
    const newState = makeBid(gameState, 0, bid);
    setGameState(newState);
  };

  const handlePass = () => {
    setMessage('Sa passisid');
    const newState = passBid(gameState, 0);
    setGameState(newState);
  };

  const handleTrumpChoice = (suit) => {
    setMessage(`Trumbiks valiti ${SUIT_NAMES_ET[suit]}`);
    const newState = chooseTrump(gameState, suit);
    setGameState(newState);
  };

  const handleCardPlay = (card) => {
    if (!canPlayCard(gameState, 0, card)) {
      setMessage('Seda kaarti ei saa mängida!');
      return;
    }

    setMessage('Sa mängisid kaardi');
    const newState = playCard(gameState, 0, card);
    setGameState(newState);
  };

  const handleNewRound = () => {
    setMessage('Uus voor algas!');
    setGameState(startNewRound(gameState));
  };

  const renderBiddingControls = () => {
    if (gameState.phase !== GAME_PHASES.BIDDING) return null;
    if (gameState.currentPlayer !== 0 || gameState.hasPassed[0]) return null;
    if (gameState.trumpMaker !== null) return null; // Trump maker chosen, don't show bidding

    const currentHighBid = Math.max(0, ...gameState.bids.filter(b => b !== null));
    const maxPossibleBid = calculateBiddingValue(gameState.hands[0]);
    const possibleBids = [];

    for (let i = currentHighBid + 1; i <= maxPossibleBid; i++) {
      possibleBids.push(i);
    }

    return (
      <div className="bidding-controls">
        <h3>Sinu pakkumine:</h3>
        <div className="bid-buttons">
          {possibleBids.slice(0, 10).map(bid => (
            <button key={bid} onClick={() => handleBid(bid)}>
              {bid}
            </button>
          ))}
        </div>
        <button className="pass-button" onClick={handlePass}>Pass</button>
      </div>
    );
  };

  const renderTrumpChoice = () => {
    if (gameState.trumpSuit) return null; // Trump already chosen
    if (gameState.trumpMaker !== 0) return null; // Not our turn to choose
    if (gameState.trumpMaker === null) return null; // No trump maker yet

    return (
      <div className="trump-choice">
        <h3>Vali trump:</h3>
        <div className="trump-buttons">
          {Object.entries(SUIT_NAMES_ET).map(([suit, name]) => (
            <button key={suit} onClick={() => handleTrumpChoice(suit)}>
              {name}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderCurrentTrick = () => {
    if (gameState.currentTrick.length === 0) return null;

    return (
      <div className="current-trick">
        <h3>Praegune tihi:</h3>
        <div className="trick-cards">
          {gameState.currentTrick.map((play, index) => (
            <div key={index} className="trick-card">
              <div className="trick-player">{PLAYER_NAMES[play.player]}</div>
              <Card card={play.card} disabled={true} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const calculateCurrentTrickPoints = () => {
    const teamPoints = [0, 0];

    // Count points from won tricks
    gameState.tricksWon.forEach((tricks, playerIndex) => {
      const team = getTeam(playerIndex);
      tricks.forEach(trick => {
        trick.forEach(play => {
          teamPoints[team] += play.card.points;
        });
      });
    });

    return teamPoints;
  };

  const renderScores = () => {
    const currentPoints = calculateCurrentTrickPoints();
    const showCurrentPoints = gameState.phase === GAME_PHASES.PLAYING && gameState.tricksWon.some(t => t.length > 0);

    return (
      <div className="scores">
        <h3>Mänguseis:</h3>
        <div className="score-row">
          <span>Meeskond 1 (Sina & Partner):</span>
          <span className="score-value">{gameState.gameScores[0]} punkti</span>
        </div>
        <div className="score-row">
          <span>Meeskond 2:</span>
          <span className="score-value">{gameState.gameScores[1]} punkti</span>
        </div>

        {showCurrentPoints && (
          <div className="current-trick-points">
            <h4>Tihipunktid:</h4>
            <div className="trick-points-row">
              <span>Meeskond 1:</span>
              <span className="points-value">{currentPoints[0]}</span>
            </div>
            <div className="trick-points-row">
              <span>Meeskond 2:</span>
              <span className="points-value">{currentPoints[1]}</span>
            </div>
          </div>
        )}

        {gameState.phase === GAME_PHASES.ROUND_END && (
          <div className="round-scores">
            <h4>Voor lõppes:</h4>
            <div>Meeskond 1: {gameState.roundScores[0]} tihipunkti</div>
            <div>Meeskond 2: {gameState.roundScores[1]} tihipunkti</div>
            <button onClick={handleNewRound}>Järgmine voor</button>
          </div>
        )}
      </div>
    );
  };

  const renderGameEnd = () => {
    if (gameState.phase !== GAME_PHASES.GAME_END) return null;

    const winner = gameState.gameScores[0] >= 12 ? 'Meeskond 1 (Sina & Partner)' : 'Meeskond 2';

    return (
      <div className="game-end">
        <h2>Mäng läbi!</h2>
        <p>Võitja: {winner}</p>
        <button onClick={() => setGameState(createInitialState())}>Uus mäng</button>
      </div>
    );
  };

  return (
    <div className="game-board">
      <div className="message-bar">{message}</div>

      <div className="game-info">
        {renderScores()}
        {gameState.trumpSuit && (
          <div className="trump-info">
            Trump: {SUIT_NAMES_ET[gameState.trumpSuit]}
          </div>
        )}
      </div>

      {renderGameEnd()}
      {renderCurrentTrick()}
      {renderBiddingControls()}
      {renderTrumpChoice()}

      <div className="players-layout">
        {/* Bottom player (human) */}
        <div className="player-position bottom">
          <Hand
            cards={gameState.hands[0]}
            onCardClick={handleCardPlay}
            canPlay={gameState.phase === GAME_PHASES.PLAYING}
            playerName={PLAYER_NAMES[0]}
            isCurrentPlayer={gameState.currentPlayer === 0}
            hidden={false}
          />
        </div>
      </div>
    </div>
  );
}
