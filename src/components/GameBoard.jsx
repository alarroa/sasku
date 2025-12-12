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
          const newState = chooseTrump(gameState, trump);
          setGameState(newState);
        } else {
          const bid = makeAIBid(gameState, playerIndex);
          if (bid !== null) {
            setGameState(makeBid(gameState, playerIndex, bid));
          } else {
            setGameState(passBid(gameState, playerIndex));
          }
        }
      } else if (gameState.phase === GAME_PHASES.PLAYING) {
        const card = chooseAICard(gameState, playerIndex);
        if (card) {
          const newState = playCard(gameState, playerIndex, card);
          setGameState(newState);
        }
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [gameState]);

  const handleBid = (bid) => {
    const newState = makeBid(gameState, 0, bid);
    setGameState(newState);
  };

  const handlePass = () => {
    const newState = passBid(gameState, 0);
    setGameState(newState);
  };

  const handleTrumpChoice = (suit) => {
    const newState = chooseTrump(gameState, suit);
    setGameState(newState);
  };

  const handleCardPlay = (card) => {
    if (!canPlayCard(gameState, 0, card)) {
      return;
    }

    const newState = playCard(gameState, 0, card);
    setGameState(newState);
  };

  const handleNewRound = () => {
    setGameState(startNewRound(gameState));
  };

  const handleRuutuBid = () => {
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

    // Calculate valid trump suits based on the bid and hand
    const hand = gameState.hands[0];
    const myBid = gameState.bids[0];
    const pictures = hand.filter(c => c.isPicture).length;

    // Count cards by suit (excluding pictures)
    const suitCounts = {};
    hand.filter(c => !c.isPicture).forEach(c => {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });

    // Find all suits that allow the bid
    // Bid = pictures + suit_count, so suit_count = bid - pictures
    const requiredSuitCount = myBid - pictures;
    const validSuits = Object.keys(suitCounts).filter(suit =>
      suitCounts[suit] >= requiredSuitCount
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
          Pakkumine: {myBid} ({pictures} pilti + vähemalt {requiredSuitCount} masti)
          <br />
          Võid valida: {validSuits.map(s => SUIT_NAMES_ET[s]).join(', ')}
        </p>
      </div>
    );
  };

  const getPlayerStatus = (playerIndex) => {
    const parts = [];

    // Show bid or pass during bidding
    if (gameState.phase === GAME_PHASES.BIDDING) {
      if (gameState.hasPassed[playerIndex]) {
        parts.push('Pass');
      } else if (gameState.bids[playerIndex] !== null) {
        parts.push(`${gameState.bids[playerIndex]}`);
      }
    }

    // Show trump suit name during playing for trump maker
    if (gameState.phase === GAME_PHASES.PLAYING && gameState.trumpMaker === playerIndex && gameState.trumpSuit) {
      parts.push(SUIT_NAMES_ET[gameState.trumpSuit]);
    }

    return parts.length > 0 ? ` (${parts.join(' ')})` : '';
  };

  const getPlayerCard = (playerIndex) => {
    // Show cards from current trick (cards being played right now)
    const play = gameState.currentTrick.find(p => p.player === playerIndex);
    if (play) return play.card;

    // Also show last completed trick (for the 2.5s delay or during round end)
    if (gameState.lastTrick && (gameState.currentTrick.length === 0 || gameState.phase === GAME_PHASES.ROUND_END)) {
      const lastPlay = gameState.lastTrick.trick.find(p => p.player === playerIndex);
      if (lastPlay) return lastPlay.card;
    }

    return null;
  };

  const renderPlayArea = () => {
    // Show play area during bidding, playing, and round end
    const shouldShow = gameState.phase === GAME_PHASES.BIDDING ||
                       gameState.phase === GAME_PHASES.PLAYING ||
                       gameState.phase === GAME_PHASES.ROUND_END;

    if (!shouldShow) return null;

    const positions = [
      { index: 0, className: 'player-bottom', name: PLAYER_NAMES[0] },
      { index: 1, className: 'player-left', name: PLAYER_NAMES[1] },
      { index: 2, className: 'player-top', name: PLAYER_NAMES[2] },
      { index: 3, className: 'player-right', name: PLAYER_NAMES[3] }
    ];

    // Check if we're showing last trick
    const showingLastTrick = (gameState.lastTrick && gameState.currentTrick.length === 0) ||
                             gameState.phase === GAME_PHASES.ROUND_END;
    const trickWinner = showingLastTrick ? gameState.lastTrick.winner : null;

    return (
      <div className="play-area">
        {gameState.phase === GAME_PHASES.ROUND_END && (
          <div className="round-end-overlay">
            <button className="next-round-button" onClick={handleNewRound}>
              Järgmine voor
            </button>
          </div>
        )}
        {positions.map(({ index, className, name }) => {
          const card = getPlayerCard(index);
          const isCurrentPlayer = gameState.currentPlayer === index;
          const isWinner = showingLastTrick && index === trickWinner;

          return (
            <div key={index} className={`player-spot ${className} ${isCurrentPlayer ? 'active' : ''} ${isWinner ? 'winner' : ''}`}>
              <div className="player-label">
                {name}{getPlayerStatus(index)}
              </div>
              {card && (
                <div className="player-card">
                  <Card card={card} trumpSuit={gameState.trumpSuit} />
                </div>
              )}
            </div>
          );
        })}
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

  const convertScoreToMarks = (score) => {
    const marks = [];
    let remaining = score;

    while (remaining >= 4) {
      marks.push('#');
      remaining -= 4;
    }
    while (remaining >= 2) {
      marks.push('||');
      remaining -= 2;
    }

    return marks;
  };

  const renderScores = () => {
    const currentPoints = calculateCurrentTrickPoints();
    const showCurrentPoints = gameState.phase === GAME_PHASES.PLAYING && gameState.tricksWon.some(t => t.length > 0);

    const ourMarks = convertScoreToMarks(gameState.gameScores[0]);
    const theirMarks = convertScoreToMarks(gameState.gameScores[1]);
    const maxRows = Math.max(ourMarks.length, theirMarks.length, 1);

    return (
      <div className="scores">
        <h3>Mänguseis (16-ni):</h3>
        <div className="score-table">
          <div className="score-header">
            <div className="score-team">Meie</div>
            <div className="score-team">Teie</div>
          </div>
          <div className="score-marks">
            {Array.from({ length: maxRows }).map((_, index) => (
              <div key={index} className="score-row-marks">
                <div className="score-mark">{ourMarks[index] || ''}</div>
                <div className="score-mark">{theirMarks[index] || ''}</div>
              </div>
            ))}
            {maxRows === 0 && (
              <div className="score-row-marks">
                <div className="score-mark"></div>
                <div className="score-mark"></div>
              </div>
            )}
          </div>
          <div className="score-totals">
            <div className="score-total">{gameState.gameScores[0]}</div>
            <div className="score-total">{gameState.gameScores[1]}</div>
          </div>
        </div>

        {showCurrentPoints && (
          <div className="current-trick-points">
            <h4>Tihipunktid:</h4>
            <div className="trick-points-row">
              <span>Meie:</span>
              <span className="points-value">{currentPoints[0]}</span>
            </div>
            <div className="trick-points-row">
              <span>Teie:</span>
              <span className="points-value">{currentPoints[1]}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGameEnd = () => {
    if (gameState.phase !== GAME_PHASES.GAME_END) return null;

    const winner = gameState.gameScores[0] >= 16 ? 'Meie' : 'Teie';

    return (
      <div className="game-end">
        <h2>Mäng läbi!</h2>
        <p>Võitja: {winner}</p>
        <p className="final-score">
          Meie: {gameState.gameScores[0]} - Teie: {gameState.gameScores[1]}
        </p>
        <button onClick={() => setGameState(createInitialState())}>Uus mäng</button>
      </div>
    );
  };

  return (
    <div className="game-board">
      <div className="main-layout">
        {/* Left sidebar with scores */}
        <div className="sidebar-left">
          {renderScores()}
        </div>

        {/* Main game area */}
        <div className="game-area">
          {renderGameEnd()}
          {renderPlayArea()}
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
      </div>
    </div>
  );
}
