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
  getTeam,
  getNextPlayer
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

    // If trick just completed (4 cards), wait longer to show the result
    const trickJustCompleted = gameState.lastTrick &&
                               gameState.lastTrick.trick.length === 4 &&
                               gameState.currentTrick.length === 0;

    const delay = trickJustCompleted ? 2500 : 600; // 2.5s for completed trick, 600ms normally

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
          const newState = playCard(gameState, playerIndex, card);

          // If trick is now complete, show who won
          if (newState.lastTrick) {
            const winner = newState.lastTrick.winner;
            setMessage(`${PLAYER_NAMES[winner]} võitis tihi!`);
          }

          setGameState(newState);
        }
      }
    }, delay);

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

    // If trick is now complete, show who won
    if (newState.lastTrick) {
      const winner = newState.lastTrick.winner;
      setMessage(`${PLAYER_NAMES[winner]} võitis tihi!`);
    }

    setGameState(newState);
  };

  const handleNewRound = () => {
    setMessage('Uus voor algas!');
    setGameState(startNewRound(gameState));
  };

  const handleRuutuBid = () => {
    setMessage('Valisid Ruudu trumpiks');
    // Automatically bid and choose diamonds as trump
    const currentHighBid = Math.max(0, ...gameState.bids.filter(b => b !== null));
    const newBid = currentHighBid + 1;

    const newState = { ...gameState };
    newState.bids = [...gameState.bids];
    newState.bids[0] = newBid;
    newState.trumpMaker = 0;
    newState.trumpSuit = SUITS.DIAMONDS;
    newState.phase = GAME_PHASES.PLAYING;
    newState.leadPlayer = getNextPlayer(newState.dealer);
    newState.currentPlayer = newState.leadPlayer;
    setGameState(newState);
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
          <button className="ruutu-button" onClick={handleRuutuBid} title="Paku kohe ruudu trumpiga (4 punkti võites)">
            Ruutu ♦
          </button>
        </div>
        <button className="pass-button" onClick={handlePass}>Pass</button>
      </div>
    );
  };

  const renderTrumpChoice = () => {
    if (gameState.trumpSuit) return null; // Trump already chosen
    if (gameState.trumpMaker !== 0) return null; // Not our turn to choose
    if (gameState.trumpMaker === null) return null; // No trump maker yet

    // Calculate valid trump suits based on the hand
    const hand = gameState.hands[0];
    const pictures = hand.filter(c => c.isPicture).length;

    // Count cards by suit (excluding pictures)
    const suitCounts = {};
    hand.filter(c => !c.isPicture).forEach(c => {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });

    // Find the longest suit(s)
    const maxSuitCount = Math.max(0, ...Object.values(suitCounts));
    const validSuits = Object.keys(suitCounts).filter(suit =>
      suitCounts[suit] === maxSuitCount
    );

    // Diamonds can always be chosen
    if (!validSuits.includes(SUITS.DIAMONDS)) {
      validSuits.push(SUITS.DIAMONDS);
    }

    return (
      <div className="trump-choice">
        <h3>Vali trump:</h3>
        <div className="trump-buttons">
          {Object.entries(SUIT_NAMES_ET)
            .filter(([suit]) => validSuits.includes(suit))
            .map(([suit, name]) => (
              <button key={suit} onClick={() => handleTrumpChoice(suit)}>
                {name}
              </button>
            ))}
        </div>
        <p className="trump-hint">
          Võid valida: {validSuits.map(s => SUIT_NAMES_ET[s]).join(', ')}
          {validSuits.includes(SUITS.DIAMONDS) && ' (Ruutu alati lubatud)'}
        </p>
      </div>
    );
  };

  const renderCurrentTrick = () => {
    // Show current trick if cards are being played
    if (gameState.currentTrick.length > 0) {
      return (
        <div className="current-trick">
          <h3>Praegune tihi:</h3>
          <div className="trick-cards">
            {gameState.currentTrick.map((play, index) => (
              <div key={index} className="trick-card">
                <div className="trick-player">{PLAYER_NAMES[play.player]}</div>
                <Card card={play.card} trumpSuit={gameState.trumpSuit} />
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Show last completed trick briefly (for 2.5 seconds after completion)
    if (gameState.lastTrick && gameState.lastTrick.trick.length === 4) {
      const winner = gameState.lastTrick.winner;
      return (
        <div className="current-trick completed-trick">
          <h3>Tihi võitis: {PLAYER_NAMES[winner]} 🏆</h3>
          <div className="trick-cards">
            {gameState.lastTrick.trick.map((play, index) => (
              <div key={index} className={`trick-card ${play.player === winner ? 'winner' : ''}`}>
                <div className="trick-player">{PLAYER_NAMES[play.player]}</div>
                <Card card={play.card} trumpSuit={gameState.trumpSuit} />
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
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

      {/* Player's hand */}
      <div className="player-hand-container">
        <Hand
          cards={gameState.hands[0]}
          onCardClick={handleCardPlay}
          canPlay={gameState.phase === GAME_PHASES.PLAYING}
          playerName={PLAYER_NAMES[0]}
          isCurrentPlayer={gameState.currentPlayer === 0}
          hidden={false}
          trumpSuit={gameState.trumpSuit}
          canPlayCardFn={(card) => canPlayCard(gameState, 0, card)}
        />
      </div>
    </div>
  );
}
