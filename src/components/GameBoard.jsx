import { useState, useEffect } from 'react';
import Hand from './Hand';
import Card from './Card';
import PlayerSpot from './PlayerSpot';
import {
  GAME_PHASES,
  DEAL_OPTIONS,
  canPlayCard,
  getTeam,
  getPartner,
  canExchangePicture
} from '../game/gameState';
import { SUITS, SUIT_NAMES_ET, SUIT_SYMBOLS, calculateBiddingValue } from '../game/cards';
import { et } from '../i18n/et';
import './GameBoard.css';

// Names/positions indexed by position RELATIVE to the viewer:
// 0 = you (bottom), 1 = left opponent, 2 = partner (top), 3 = right opponent
const RELATIVE_NAMES = [et.players.you, et.players.player2, et.players.partner, et.players.player4];
const RELATIVE_POS = ['bottom', 'left', 'top', 'right'];

export default function GameBoard({
  gameState,
  mySeat = 0,
  dispatch,
  roomCode = null,
  connectedSeats = [],
  heldSeats = [],
  status = null,
  onNewGame,
  onLeaveToMenu
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Id of the completed trick that has been faded out. Comparing against the
  // current last-trick id avoids a second setState-in-effect to reset a flag.
  const [hiddenTrickId, setHiddenTrickId] = useState(null);

  // Fade out the just-completed trick a couple of seconds after it finishes
  useEffect(() => {
    if (!gameState || !gameState.lastTrick) return;
    if (gameState.currentTrick.length !== 0 || gameState.phase !== GAME_PHASES.PLAYING) return;
    const trickId = gameState.lastTrick.trick.map(p => p.card.id).join(',');
    if (trickId === hiddenTrickId) return;
    const timer = setTimeout(() => setHiddenTrickId(trickId), 2000);
    return () => clearTimeout(timer);
  }, [gameState, hiddenTrickId]);

  if (!gameState) return null;

  const myTeam = getTeam(mySeat);
  const oppTeam = 1 - myTeam;

  // Position of an absolute seat relative to the viewer (0 = self, clockwise)
  const relPos = (seat) => (seat - mySeat + 4) % 4;

  // Am I the partner who must choose a card to give back in a pending exchange?
  const exchange = gameState.pendingPictureExchange;
  const amExchangeResponder = !!exchange && mySeat === getPartner(exchange.fromPlayer);

  const handleDealChoice = (option) => dispatch({ type: 'dealChoice', option });
  const handlePackChoice = (packIndex) => dispatch({ type: 'packChoice', index: packIndex });
  const handleBid = (bid) => dispatch({ type: 'bid', value: bid, omale: false });
  const handlePass = () => dispatch({ type: 'pass' });
  const handleRuutuBid = () => dispatch({ type: 'ruutuBid' });
  const handleTrumpChoice = (suit) => dispatch({ type: 'trump', suit });
  const handleNewRound = () => dispatch({ type: 'newRound' });
  const handleNewMatch = () => dispatch({ type: 'newMatch' });
  const handleExchangePictureClick = () => dispatch({ type: 'initiateExchange' });

  const handleOmale = () => {
    const currentHighBid = Math.max(0, ...gameState.bids.filter(b => b !== null));
    dispatch({ type: 'bid', value: currentHighBid, omale: true });
  };

  const handleCardPlay = (card) => {
    // If I'm the partner being offered a picture, this click picks the give-back card
    if (amExchangeResponder) {
      if (card.isPicture) return;
      dispatch({ type: 'exchangeGiveBack', card });
      return;
    }
    if (!canPlayCard(gameState, mySeat, card)) return;
    dispatch({ type: 'playCard', card });
  };

  const shouldShowBiddingControls = () => {
    return gameState.phase === GAME_PHASES.BIDDING &&
           gameState.currentPlayer === mySeat &&
           !gameState.hasPassed[mySeat] &&
           gameState.trumpMaker === null &&
           !gameState.pendingPictureExchange;
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

    // Check if "Omale" is available: player made a bid before the current high bidder
    let canOmale = false;
    if (currentHighBid > 0 && currentHighBid <= maxPossibleBid) {
      const bidsWithPlayers = gameState.bids.map((b, i) => ({ bid: b, player: i }))
        .filter(b => b.bid !== null);

      if (bidsWithPlayers.length >= 2) {
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

    const canExchange = canExchangePicture(gameState, mySeat);

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
          {canExchange && (
            <button className="exchange-button" onClick={handleExchangePictureClick}>
              {et.bidding.exchangePicture}
            </button>
          )}
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

    const hand = gameState.hands[mySeat];
    const myBid = gameState.bids[mySeat];
    const pictures = hand.filter(c => c.isPicture).length;

    const suitCounts = {};
    hand.filter(c => !c.isPicture).forEach(c => {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    });

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
    if (gameState.phase === GAME_PHASES.PLAYING &&
        gameState.trumpMaker === playerIndex &&
        gameState.trumpSuit) {
      return SUIT_SYMBOLS[gameState.trumpSuit];
    }
    return null;
  };

  const getPlayerCard = (playerIndex) => {
    // Cards being played right now
    const play = gameState.currentTrick.find(p => p.player === playerIndex);
    if (play) return play.card;

    // Last completed trick (during the brief delay or at round end)
    if (gameState.lastTrick &&
        (gameState.currentTrick.length === 0 || gameState.phase === GAME_PHASES.ROUND_END)) {
      const trickId = gameState.lastTrick.trick.map(p => p.card.id).join(',');
      if (trickId !== hiddenTrickId) {
        const lastPlay = gameState.lastTrick.trick.find(p => p.player === playerIndex);
        if (lastPlay) return lastPlay.card;
      }
    }

    return null;
  };

  const calculateCurrentTrickPoints = () => {
    const teamPoints = [0, 0];
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
    const shouldShow = gameState.phase === GAME_PHASES.BIDDING ||
                       gameState.phase === GAME_PHASES.PLAYING ||
                       gameState.phase === GAME_PHASES.ROUND_END;

    if (!shouldShow) return null;

    // Place each seat by its position relative to the viewer (viewer at bottom)
    const positions = [0, 1, 2, 3].map((seat) => ({
      index: seat,
      position: RELATIVE_POS[relPos(seat)],
      name: RELATIVE_NAMES[relPos(seat)]
    }));

    const myPartner = getPartner(mySeat);

    const showingLastTrick = (gameState.lastTrick && gameState.currentTrick.length === 0) ||
                             gameState.phase === GAME_PHASES.ROUND_END;
    const trickWinner = showingLastTrick ? gameState.lastTrick.winner : null;

    return (
      <div className="play-area">
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

        {/* Picture exchange offered to me — I choose which card to give back */}
        {amExchangeResponder && (
          <div className="center-overlay exchange-overlay">
            <div className="overlay-content">
              <h3>{et.bidding.partnerOffersPicture}</h3>
              <div className="exchange-picture-preview">
                <Card card={exchange.pictureCard} trumpSuit={gameState.trumpSuit} />
              </div>
              <p>{et.bidding.selectCardToGive}</p>
            </div>
          </div>
        )}

        {/* Center overlay for round end */}
        {gameState.phase === GAME_PHASES.ROUND_END && (
          <div className="center-overlay">
            <div className="round-end-content">
              {(() => {
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

        {positions.map(({ index, position, name }) => {
          const card = getPlayerCard(index);
          const isCurrentPlayer = gameState.currentPlayer === index;
          const isWinner = showingLastTrick && index === trickWinner;
          const trumpIcon = getTrumpIcon(index);
          const cardCount = gameState.hands[index].length;

          return (
            <PlayerSpot
              key={index}
              position={position}
              name={name}
              cardCount={cardCount}
              playedCard={card}
              isCurrentPlayer={isCurrentPlayer}
              isWinner={isWinner}
              isPartner={index === myPartner}
              trumpSuit={gameState.trumpSuit}
              trumpIcon={trumpIcon}
              isHuman={index === mySeat}
              bidStatus={getPlayerStatus(index)}
            />
          );
        })}

        {/* Hand integrated into table bottom edge */}
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
            isExchanging={amExchangeResponder}
          />
        </div>
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

  const seatState = (seat) => {
    if (connectedSeats.includes(seat)) return 'filled';
    if (heldSeats.includes(seat)) return 'held';
    return 'ai';
  };

  const renderRoomBanner = () => {
    if (!roomCode) return null;

    const seatLabel = (seat) => (relPos(seat) === 2 ? et.lobby.seatPartner : et.lobby.seatOpponent);
    const seatMark = (seat) => {
      const s = seatState(seat);
      if (s === 'filled') return '✓';
      if (s === 'held') return '⟳';
      return et.lobby.empty;
    };

    return (
      <div className="room-banner">
        <span className="room-code-label">{et.lobby.roomCode}</span>
        <span className="room-code-value">{roomCode}</span>
        <span className="room-players">
          {[2, 1, 3].map((seat) => (
            <span key={seat} className={`room-seat ${seatState(seat)}`}>
              {seatLabel(seat)}: {seatMark(seat)}
            </span>
          ))}
        </span>
      </div>
    );
  };

  const renderReconnecting = () => {
    if (status !== 'reconnecting') return null;
    return (
      <div className="reconnect-pill">
        <span className="reconnect-dot" aria-hidden="true" />
        {et.lobby.reconnecting}
      </div>
    );
  };

  const currentTrickPoints = calculateCurrentTrickPoints();
  const showTrickPoints = gameState.phase === GAME_PHASES.PLAYING ||
                          gameState.phase === GAME_PHASES.ROUND_END;

  return (
    <div className="game-board">
      <header className="app-header">
        <h1 className="app-title">{et.meta.title}</h1>
        <div className="header-scores">
          {showTrickPoints && (
            <div className="header-score-block trick-points">
              <span className="header-score-label">{et.scoring.trickPoints}</span>
              <span className="header-score-pair">
                <span className="header-score-team">{et.scoring.ourTeam}</span>
                <span className="header-score-value">{currentTrickPoints[myTeam]}</span>
                <span className="header-score-sep">·</span>
                <span className="header-score-team">{et.scoring.theirTeam}</span>
                <span className="header-score-value">{currentTrickPoints[oppTeam]}</span>
              </span>
            </div>
          )}
          <div className="header-score-block match-status">
            <span className="header-score-label">{et.scoring.gameStatus}</span>
            <span className="header-score-pair">
              <span className="header-score-team">{et.scoring.ourTeam}</span>
              <span className="header-score-value">
                {gameState.gameScores[myTeam]}<span className="header-score-mini">|{gameState.matchWins[myTeam]}</span>
              </span>
              <span className="header-score-sep">·</span>
              <span className="header-score-team">{et.scoring.theirTeam}</span>
              <span className="header-score-value">
                {gameState.gameScores[oppTeam]}<span className="header-score-mini">|{gameState.matchWins[oppTeam]}</span>
              </span>
            </span>
          </div>
        </div>
        <div className="header-menu">
          <button
            className="settings-button"
            aria-label={et.lobby.menu}
            onClick={() => setMenuOpen(o => !o)}
          >
            ⚙
          </button>
          {menuOpen && (
            <div className="settings-dropdown">
              {onNewGame && (
                <button
                  className="settings-item"
                  onClick={() => { setMenuOpen(false); onNewGame(); }}
                >
                  {et.gameEnd.newGame}
                </button>
              )}
              {onLeaveToMenu && (
                <button
                  className="settings-item"
                  onClick={() => { setMenuOpen(false); onLeaveToMenu(); }}
                >
                  {et.lobby.menu}
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      {renderRoomBanner()}
      {renderReconnecting()}
      {renderGameEnd()}
      {renderDealChoice()}
      {renderPackChoice()}
      {renderPlayArea()}
    </div>
  );
}
