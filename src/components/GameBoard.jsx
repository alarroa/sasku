import Hand from './Hand';
import Card from './Card';
import {
  GAME_PHASES,
  DEAL_OPTIONS,
  canPlayCard,
  getTeam
} from '../game/gameState';
import { SUITS, SUIT_NAMES_ET, SUIT_SYMBOLS, calculateBiddingValue } from '../game/cards';
import { et } from '../i18n/et';
import './GameBoard.css';

// Names indexed by position RELATIVE to the viewer:
// 0 = you (bottom), 1 = left opponent, 2 = partner (top), 3 = right opponent
const RELATIVE_NAMES = [et.players.you, et.players.player2, et.players.partner, et.players.player4];
const RELATIVE_CLASS = ['player-bottom', 'player-left', 'player-top', 'player-right'];

export default function GameBoard({
  gameState,
  mySeat = 0,
  dispatch,
  roomCode = null,
  connectedSeats = []
}) {
  if (!gameState) return null;

  const myTeam = getTeam(mySeat);
  const oppTeam = 1 - myTeam;

  // Position of an absolute seat relative to the viewer (0 = self, clockwise)
  const relPos = (seat) => (seat - mySeat + 4) % 4;

  const handleDealChoice = (option) => dispatch({ type: 'dealChoice', option });
  const handlePackChoice = (packIndex) => dispatch({ type: 'packChoice', index: packIndex });
  const handleBid = (bid) => dispatch({ type: 'bid', value: bid, omale: false });
  const handlePass = () => dispatch({ type: 'pass' });
  const handleRuutuBid = () => dispatch({ type: 'ruutuBid' });
  const handleTrumpChoice = (suit) => dispatch({ type: 'trump', suit });
  const handleNewRound = () => dispatch({ type: 'newRound' });
  const handleNewMatch = () => dispatch({ type: 'newMatch' });

  const handleOmale = () => {
    const currentHighBid = Math.max(0, ...gameState.bids.filter(b => b !== null));
    dispatch({ type: 'bid', value: currentHighBid, omale: true });
  };

  const handleCardPlay = (card) => {
    if (!canPlayCard(gameState, mySeat, card)) return;
    dispatch({ type: 'playCard', card });
  };

  const shouldShowBiddingControls = () => {
    return gameState.phase === GAME_PHASES.BIDDING &&
           gameState.currentPlayer === mySeat &&
           !gameState.hasPassed[mySeat] &&
           gameState.trumpMaker === null;
  };

  const renderDealChoice = () => {
    if (gameState.phase !== GAME_PHASES.DEAL_CHOICE || gameState.currentPlayer !== mySeat) {
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
    if (gameState.phase !== GAME_PHASES.PACK_CHOICE || gameState.currentPlayer !== mySeat) {
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
    const maxPossibleBid = calculateBiddingValue(gameState.hands[mySeat]);
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
        // Check if this player made a bid before the current high bid
        for (let i = bidsWithPlayers.length - 1; i >= 0; i--) {
          if (bidsWithPlayers[i].bid < currentHighBid && bidsWithPlayers[i].player === mySeat) {
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
           gameState.trumpMaker === mySeat &&
           gameState.trumpMaker !== null;
  };

  const renderTrumpChoice = () => {
    if (!shouldShowTrumpChoice()) return null;

    // Calculate valid trump suits based on the bid and hand
    const hand = gameState.hands[mySeat];
    const myBid = gameState.bids[mySeat];
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

    // Also show last completed trick (for the 2.5s delay or during round end)
    if (gameState.lastTrick && (gameState.currentTrick.length === 0 || gameState.phase === GAME_PHASES.ROUND_END)) {
      const lastPlay = gameState.lastTrick.trick.find(p => p.player === playerIndex);
      if (lastPlay) return lastPlay.card;
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

  const renderPlayArea = () => {
    // Show play area during bidding, playing, and round end
    const shouldShow = gameState.phase === GAME_PHASES.BIDDING ||
                       gameState.phase === GAME_PHASES.PLAYING ||
                       gameState.phase === GAME_PHASES.ROUND_END;

    if (!shouldShow) return null;

    // Players placed by position relative to the viewer (viewer always at bottom)
    const positions = [0, 1, 2, 3].map((seat) => ({
      index: seat,
      className: RELATIVE_CLASS[relPos(seat)],
      name: RELATIVE_NAMES[relPos(seat)]
    }));

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
              <span className="score-value">{currentPoints[myTeam]}</span>
            </div>
            <div className="corner-score-row">
              <span className="score-label">{et.scoring.theirTeam}:</span>
              <span className="score-value">{currentPoints[oppTeam]}</span>
            </div>
          </div>
        </div>

        {/* Top-right: Game scores */}
        <div className="corner-info top-right">
          <div className="corner-label">{et.scoring.gameStatus}</div>
          <div className="corner-scores">
            <div className="corner-score-row">
              <span className="score-label">{et.scoring.ourTeam}:</span>
              <span className="score-value">{gameState.gameScores[myTeam]} | {gameState.matchWins[myTeam]}</span>
            </div>
            <div className="corner-score-row">
              <span className="score-label">{et.scoring.theirTeam}:</span>
              <span className="score-value">{gameState.gameScores[oppTeam]} | {gameState.matchWins[oppTeam]}</span>
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

  const renderGameEnd = () => {
    if (gameState.phase !== GAME_PHASES.GAME_END) return null;

    const weWon = gameState.gameScores[myTeam] >= 16;
    const winner = weWon ? et.scoring.ourTeam : et.scoring.theirTeam;

    return (
      <div className="game-end">
        <h3>{et.gameEnd.gameOver}</h3>
        <p className="final-score">
          {et.scoring.ourTeam}: {gameState.gameScores[myTeam]} - {et.scoring.theirTeam}: {gameState.gameScores[oppTeam]}
        </p>
        <h3 className="match-wins">
          {et.gameEnd.matchWins}: {et.scoring.ourTeam} {gameState.matchWins[myTeam]} - {et.scoring.theirTeam} {gameState.matchWins[oppTeam]}
        </h3>
        <p className="winner-line">{et.gameEnd.winner.replace('{winner}', winner)}</p>
        <button onClick={handleNewMatch} className="new-match-button">
          {et.gameEnd.newMatch}
        </button>
      </div>
    );
  };

  const renderRoomBanner = () => {
    if (!roomCode) return null;

    // Show which networked seats are filled by humans (relative labels)
    const seatLabel = (seat) => {
      const pos = relPos(seat);
      if (pos === 2) return et.lobby.seatPartner;
      return et.lobby.seatOpponent;
    };

    return (
      <div className="room-banner">
        <span className="room-code-label">{et.lobby.roomCode}:</span>
        <span className="room-code-value">{roomCode}</span>
        <span className="room-players">
          {[2, 1, 3].map((seat) => (
            <span
              key={seat}
              className={`room-seat ${connectedSeats.includes(seat) ? 'filled' : 'ai'}`}
            >
              {seatLabel(seat)}: {connectedSeats.includes(seat) ? '✓' : et.lobby.empty}
            </span>
          ))}
        </span>
      </div>
    );
  };

  return (
    <div className="game-board">
      {renderRoomBanner()}
      {renderGameEnd()}
      {renderDealChoice()}
      {renderPackChoice()}
      {renderPlayArea()}

      {/* Player's hand */}
      <div className="player-hand-container">
        <Hand
          cards={gameState.hands[mySeat]}
          onCardClick={handleCardPlay}
          canPlay={gameState.phase === GAME_PHASES.PLAYING}
          isCurrentPlayer={gameState.currentPlayer === mySeat}
          hidden={false}
          trumpSuit={gameState.trumpSuit}
          canPlayCardFn={(card) => canPlayCard(gameState, mySeat, card)}
          isBidding={gameState.phase === GAME_PHASES.BIDDING}
        />
      </div>
    </div>
  );
}
