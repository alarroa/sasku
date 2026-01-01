import { useState, useEffect, useRef } from 'react';
import Hand from './Hand';
import Card from './Card';
import {
  createInitialState,
  GAME_PHASES,
  DEAL_OPTIONS,
  canPlayCard,
  playCard,
  makeBid,
  passBid,
  chooseTrump,
  chooseDealOption,
  chooseCardPack,
  startNewRound,
  startNewMatch,
  getTeam,
  getNextPlayer
} from '../game/gameState';
import { makeAIBid, chooseAITrump, chooseAICard } from '../game/ai';
import { SUITS, SUIT_NAMES_ET, SUIT_SYMBOLS, calculateBiddingValue } from '../game/cards';
import { et } from '../i18n/et';
import './GameBoard.css';

const PLAYER_NAMES = [et.players.you, et.players.player2, et.players.partner, et.players.player4];

const STORAGE_KEY = 'sasku-game-state';

export default function GameBoard() {
  const [gameState, setGameState] = useState(() => {
    // Try to load saved game state from localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const loadedState = JSON.parse(saved);
        // Ensure matchWins exists (for backwards compatibility)
        if (!loadedState.matchWins) {
          loadedState.matchWins = [0, 0];
        }
        // Ensure pokkBonus exists (for backwards compatibility)
        if (loadedState.pokkBonus === undefined) {
          loadedState.pokkBonus = false;
        }
        return loadedState;
      }
    } catch (error) {
      console.error('Failed to load game state:', error);
    }
    return createInitialState();
  });

  // Track when to hide last trick cards
  const [hideLastTrick, setHideLastTrick] = useState(false);
  const lastTrickRef = useRef(null);

  // Save game state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
    } catch (error) {
      console.error('Failed to save game state:', error);
    }
  }, [gameState]);

  // Auto-pass if player has already passed during bidding
  useEffect(() => {
    if (gameState.phase === GAME_PHASES.BIDDING &&
        gameState.currentPlayer === 0 &&
        gameState.hasPassed[0]) {
      // Player has already passed, skip their turn
      const timer = setTimeout(() => {
        setGameState(passBid(gameState, 0));
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [gameState]);

  // Handle hiding last trick cards after 2.5 seconds
  useEffect(() => {
    if (gameState.lastTrick && gameState.currentTrick.length === 0 && gameState.phase === GAME_PHASES.PLAYING) {
      // New trick completed
      const trickId = gameState.lastTrick.trick.map(p => p.card.id).join(',');

      if (lastTrickRef.current !== trickId) {
        // This is a new trick, schedule hiding after 2.5s
        lastTrickRef.current = trickId;

        // Start timer to hide cards
        const timer = setTimeout(() => {
          setHideLastTrick(true);
        }, 2500);

        return () => clearTimeout(timer);
      }
    } else {
      // No last trick or not in playing phase
      lastTrickRef.current = null;
    }
  }, [gameState.lastTrick, gameState.currentTrick.length, gameState.phase]);

  // Reset hideLastTrick when a new trick starts
  useEffect(() => {
    if (gameState.currentTrick.length > 0) {
      setHideLastTrick(false);
    }
  }, [gameState.currentTrick.length]);

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

      if (gameState.phase === GAME_PHASES.DEAL_CHOICE) {
        // AI always chooses "Tõstan" (normal deal)
        setGameState(chooseDealOption(gameState, DEAL_OPTIONS.TOSTAN));
      } else if (gameState.phase === GAME_PHASES.BIDDING) {
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
        } else {
          // Safety fallback: if AI can't choose a card, play the first legal card
          console.error('AI could not choose a card, using fallback');
          const hand = gameState.hands[playerIndex];
          const fallbackCard = hand.find(c => canPlayCard(gameState, playerIndex, c));
          if (fallbackCard) {
            const newState = playCard(gameState, playerIndex, fallbackCard);
            setGameState(newState);
          }
        }
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [gameState]);

  const handleDealChoice = (option) => {
    setGameState(chooseDealOption(gameState, option));
  };

  const handlePackChoice = (packIndex) => {
    setGameState(chooseCardPack(gameState, 0, packIndex));
  };

  const handleBid = (bid) => {
    const newState = makeBid(gameState, 0, bid, false);
    setGameState(newState);
  };

  const handleOmale = () => {
    const currentHighBid = Math.max(0, ...gameState.bids.filter(b => b !== null));
    const newState = makeBid(gameState, 0, currentHighBid, true);
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
    // Minimum bid is 5
    const currentHighBid = Math.max(0, ...gameState.bids.filter(b => b !== null));
    const newBid = Math.max(5, currentHighBid + 1);

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

  const shouldShowBiddingControls = () => {
    return gameState.phase === GAME_PHASES.BIDDING &&
           gameState.currentPlayer === 0 &&
           !gameState.hasPassed[0] &&
           gameState.trumpMaker === null;
  };

  const renderDealChoice = () => {
    if (gameState.phase !== GAME_PHASES.DEAL_CHOICE || gameState.currentPlayer !== 0) {
      return null;
    }

    return (
      <div className="center-overlay">
        <div className="overlay-content">
          <h3>{et.dealChoice.title}</h3>
          <div className="deal-choice-buttons">
            <button className="deal-choice-button" onClick={() => handleDealChoice(DEAL_OPTIONS.TOSTAN)}>
              <div className="deal-choice-title">{et.dealChoice.tostan}</div>
              <div className="deal-choice-desc">{et.dealChoice.tostanDesc}</div>
            </button>
            <button className="deal-choice-button" onClick={() => handleDealChoice(DEAL_OPTIONS.PIME_RUUTU)}>
              <div className="deal-choice-title">{et.dealChoice.pimeRuutu}</div>
              <div className="deal-choice-desc">{et.dealChoice.pimeRuutuDesc}</div>
            </button>
            <button className="deal-choice-button" onClick={() => handleDealChoice(DEAL_OPTIONS.VALIDA)}>
              <div className="deal-choice-title">{et.dealChoice.valida}</div>
              <div className="deal-choice-desc">{et.dealChoice.validaDesc}</div>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPackChoice = () => {
    if (gameState.phase !== GAME_PHASES.PACK_CHOICE || gameState.currentPlayer !== 0) {
      return null;
    }

    return (
      <div className="center-overlay">
        <div className="overlay-content">
          <h3>{et.dealChoice.choosePack}</h3>
          <div className="pack-choice-grid">
            {gameState.cardPacks.map((pack, index) => (
              <div key={index} className="pack-choice" onClick={() => handlePackChoice(index)}>
                <div className="pack-cards">
                  <Card card={pack.topCard} disabled={false} />
                  <Card card={pack.bottomCard} disabled={false} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderBiddingControls = () => {
    if (!shouldShowBiddingControls()) return null;

    const currentHighBid = Math.max(0, ...gameState.bids.filter(b => b !== null));
    const maxPossibleBid = calculateBiddingValue(gameState.hands[0]);
    const possibleBids = [];

    // Minimum bid is 5
    const minBid = Math.max(5, currentHighBid + 1);

    // Check if "Omale" is available
    // Player can say "Omale" if they made a bid before the current high bidder
    let canOmale = false;
    if (currentHighBid > 0 && currentHighBid <= maxPossibleBid) {
      const bidsWithPlayers = gameState.bids.map((b, i) => ({ bid: b, player: i }))
        .filter(b => b.bid !== null);

      if (bidsWithPlayers.length >= 2) {
        // Check if player 0 made a bid before the current high bid
        for (let i = bidsWithPlayers.length - 1; i >= 0; i--) {
          if (bidsWithPlayers[i].bid < currentHighBid && bidsWithPlayers[i].player === 0) {
            canOmale = true;
            break;
          }
        }
      }
    }

    for (let i = minBid; i <= maxPossibleBid; i++) {
      possibleBids.push(i);
    }

    return (
      <>
        <h3>{et.bidding.yourBid}</h3>
        <div className="bid-buttons">
          {canOmale && (
            <button className="omale-button" onClick={() => handleOmale()}>
              {et.bidding.omale} ({currentHighBid})
            </button>
          )}
          {possibleBids.slice(0, 10).map(bid => (
            <button key={bid} onClick={() => handleBid(bid)}>
              {bid}
            </button>
          ))}
          <button className="ruutu-button" onClick={handleRuutuBid}>
            {et.bidding.ruutuButton}
          </button>
            <button className="pass-button" onClick={handlePass}>{et.bidding.pass}</button>
        </div>
      </>
    );
  };

  const shouldShowTrumpChoice = () => {
    return !gameState.trumpSuit &&
           gameState.trumpMaker === 0 &&
           gameState.trumpMaker !== null;
  };

  const renderTrumpChoice = () => {
    if (!shouldShowTrumpChoice()) return null;

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
      <>
        <h3>{et.bidding.chooseTrump}</h3>
        <div className="trump-buttons">
          {Object.entries(SUIT_NAMES_ET)
            .filter(([suit]) => validSuits.includes(suit))
            .map(([suit, name]) => (
              <button key={suit} onClick={() => handleTrumpChoice(suit)}>
                {name}
              </button>
            ))}
        </div>
      </>
    );
  };

  const getPlayerStatus = (playerIndex) => {
    const parts = [];

    // Show bid or pass during bidding
    if (gameState.phase === GAME_PHASES.BIDDING) {
      if (gameState.hasPassed[playerIndex]) {
        parts.push(et.bidding.pass);
      } else if (gameState.bids[playerIndex] !== null) {
        parts.push(`${gameState.bids[playerIndex]}`);
      }
    }

    return parts.length > 0 ? ` (${parts.join(' ')})` : '';
  };

  const getTrumpIcon = (playerIndex) => {
    // Show trump icon for trump maker during playing
    if (gameState.phase === GAME_PHASES.PLAYING &&
        gameState.trumpMaker === playerIndex &&
        gameState.trumpSuit) {
      return SUIT_SYMBOLS[gameState.trumpSuit];
    }
    return null;
  };

  const getPlayerCard = (playerIndex) => {
    // Show cards from current trick (cards being played right now)
    const play = gameState.currentTrick.find(p => p.player === playerIndex);
    if (play) return play.card;

    // Show last completed trick (for 2.5s delay or during round end)
    if (gameState.lastTrick &&
        (gameState.currentTrick.length === 0 || gameState.phase === GAME_PHASES.ROUND_END) &&
        !hideLastTrick) {
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

    // Calculate trick points for display
    const currentPoints = calculateCurrentTrickPoints();

    return (
      <div className="play-area">
        {/* Top-left: Trick points */}
        <div className="corner-info top-left">
          <div className="corner-label">{et.scoring.trickPoints}</div>
          <div className="corner-scores">
            <div className="corner-score-row">
              <span className="score-label">{et.scoring.ourTeam}:</span>
              <span className="score-value">{currentPoints[0]}</span>
            </div>
            <div className="corner-score-row">
              <span className="score-label">{et.scoring.theirTeam}:</span>
              <span className="score-value">{currentPoints[1]}</span>
            </div>
          </div>
        </div>

        {/* Top-right: Game scores */}
        <div className="corner-info top-right">
          <div className="corner-label">{et.scoring.gameStatus}</div>
          <div className="corner-scores">
            <div className="corner-score-row">
              <span className="score-label">{et.scoring.ourTeam}:</span>
              <span className="score-value">{gameState.gameScores[0]} | {gameState.matchWins[0]}</span>
            </div>
            <div className="corner-score-row">
              <span className="score-label">{et.scoring.theirTeam}:</span>
              <span className="score-value">{gameState.gameScores[1]} | {gameState.matchWins[1]}</span>
            </div>
          </div>
        </div>

        {/* Bottom overlays for bidding/trump */}
        {shouldShowBiddingControls() && (
          <div className="bottom-overlay">
            <div className="overlay-content">
              {renderBiddingControls()}
            </div>
          </div>
        )}

        {shouldShowTrumpChoice() && (
          <div className="bottom-overlay">
            <div className="overlay-content">
              {renderTrumpChoice()}
            </div>
          </div>
        )}

        {/* Center overlay for round end */}
        {gameState.phase === GAME_PHASES.ROUND_END && (
          <div className="center-overlay">
            <div className="round-end-content">
              {(() => {
                // Check for Pokk (60-60 tie)
                const isPokk = gameState.roundScores[0] === 60 && gameState.roundScores[1] === 60;
                const buttonText = isPokk ? `${et.scoring.pokk} - ${et.scoring.nextRound}` : et.scoring.nextRound;

                return (
                  <button className="next-round-button" onClick={handleNewRound}>
                    {buttonText}
                  </button>
                );
              })()}
            </div>
          </div>
        )}
        {positions.map(({ index, className, name }) => {
          const card = getPlayerCard(index);
          const isCurrentPlayer = gameState.currentPlayer === index;
          const isWinner = showingLastTrick && index === trickWinner;
          const trumpIcon = getTrumpIcon(index);

          return (
            <div key={index} className={`player-spot ${className} ${isCurrentPlayer ? 'active' : ''} ${isWinner ? 'winner' : ''}`}>
              <div className="player-label">
                {name}{getPlayerStatus(index)}
                {trumpIcon && (
                  <span className={`trump-icon trump-${gameState.trumpSuit}`}>
                    {trumpIcon}
                  </span>
                )}
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
        <h3>{et.scoring.gameStatus}</h3>
        <div className="score-table">
          <div className="score-header">
            <div className="score-team">{et.scoring.ourTeam}</div>
            <div className="score-team">{et.scoring.theirTeam}</div>
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
            <div className="score-total">{gameState.gameScores[0]} | {gameState.matchWins[0]}</div>
            <div className="score-total">{gameState.gameScores[1]} | {gameState.matchWins[1]}</div>
          </div>
        </div>

        {showCurrentPoints && (
          <div className="current-trick-points">
            <h4>{et.scoring.trickPoints}</h4>
            <div className="trick-points-row">
              <span>{et.scoring.ourTeam}:</span>
              <span className="points-value">{currentPoints[0]}</span>
            </div>
            <div className="trick-points-row">
              <span>{et.scoring.theirTeam}:</span>
              <span className="points-value">{currentPoints[1]}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleNewMatch = () => {
    setGameState(startNewMatch(gameState));
  };

  const renderGameEnd = () => {
    if (gameState.phase !== GAME_PHASES.GAME_END) return null;

    const winner = gameState.gameScores[0] >= 16 ? et.scoring.ourTeam : et.scoring.theirTeam;

    return (
      <div className="game-end">
        <h3>{et.gameEnd.gameOver}</h3>
        <p className="final-score">
          {et.scoring.ourTeam}: {gameState.gameScores[0]} - {et.scoring.theirTeam}: {gameState.gameScores[1]}
        </p>
        <h3 className="match-wins">
          {et.gameEnd.matchWins}: {et.scoring.ourTeam} {gameState.matchWins[0]} - {et.scoring.theirTeam} {gameState.matchWins[1]}
        </h3>
        <button onClick={handleNewMatch} className="new-match-button">
          {et.gameEnd.newMatch}
        </button>
      </div>
    );
  };

  return (
    <div className="game-board">
      {renderGameEnd()}
      {renderDealChoice()}
      {renderPackChoice()}
      {renderPlayArea()}

      {/* Player's hand */}
      <div className="player-hand-container">
        <Hand
          cards={gameState.hands[0]}
          onCardClick={handleCardPlay}
          canPlay={gameState.phase === GAME_PHASES.PLAYING}
          isCurrentPlayer={gameState.currentPlayer === 0}
          hidden={false}
          trumpSuit={gameState.trumpSuit}
          canPlayCardFn={(card) => canPlayCard(gameState, 0, card)}
          isBidding={gameState.phase === GAME_PHASES.BIDDING}
        />
      </div>
    </div>
  );
}
