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

// Positions indexed by position RELATIVE to the viewer:
// 0 = you (bottom), 1 = left opponent, 2 = partner (top), 3 = right opponent
const RELATIVE_POS = ['bottom', 'left', 'top', 'right'];

// Remembers the name the player last used to join a networked game
const NAME_STORAGE_KEY = 'sasku-player-name';

export default function GameBoard({
  gameState,
  mySeat = 0,
  dispatch,
  mode = 'single',
  roomCode = null,
  connectedSeats = [],
  playerNames = [],
  status = null,
  onNewGame,
  onCreateGame,
  onJoinGame,
  onLeaveNetwork
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState('main'); // 'main' | 'join'
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState(() => {
    try { return localStorage.getItem(NAME_STORAGE_KEY) || ''; } catch { return ''; }
  });
  // Id of the completed trick that has been faded out. Comparing against the
  // current last-trick id avoids a second setState-in-effect to reset a flag.
  const [hiddenTrickId, setHiddenTrickId] = useState(null);
  // Last-trick id for which the game-end modal has been revealed; until then
  // the final trick stays visible on the table.
  const [gameEndShownKey, setGameEndShownKey] = useState(null);

  // Fade out the just-completed trick a couple of seconds after it finishes
  useEffect(() => {
    if (!gameState || !gameState.lastTrick) return;
    if (gameState.currentTrick.length !== 0 || gameState.phase !== GAME_PHASES.PLAYING) return;
    const trickId = gameState.lastTrick.trick.map(p => p.card.id).join(',');
    if (trickId === hiddenTrickId) return;
    const timer = setTimeout(() => setHiddenTrickId(trickId), 2000);
    return () => clearTimeout(timer);
  }, [gameState, hiddenTrickId]);

  // When the game ends, keep showing the final trick for a moment before
  // revealing the game-end modal.
  useEffect(() => {
    if (!gameState || gameState.phase !== GAME_PHASES.GAME_END) return;
    const key = gameState.lastTrick
      ? gameState.lastTrick.trick.map(p => p.card.id).join(',')
      : 'no-trick';
    if (key === gameEndShownKey) return;
    const timer = setTimeout(() => setGameEndShownKey(key), 2500);
    return () => clearTimeout(timer);
  }, [gameState, gameEndShownKey]);

  if (!gameState) return null;

  const myTeam = getTeam(mySeat);
  const oppTeam = 1 - myTeam;

  // The game-end modal is held back briefly so the final trick stays visible
  const gameEndReady = gameState.phase === GAME_PHASES.GAME_END &&
    gameEndShownKey === (gameState.lastTrick
      ? gameState.lastTrick.trick.map(p => p.card.id).join(',')
      : 'no-trick');

  // Position of an absolute seat relative to the viewer (0 = self, clockwise)
  const relPos = (seat) => (seat - mySeat + 4) % 4;

  // Label for a seat: the viewer is always "you"; other seats use the player's
  // custom name when known, otherwise a seat-based name that is identical for
  // every viewer (so two players never call the same AI by different names).
  const seatName = (seat) => {
    if (seat === mySeat) return et.players.you;
    return playerNames[seat] || et.players.seatNames[seat];
  };

  // Am I the partner who must choose a card to give back in a pending exchange?
  const exchange = gameState.pendingPictureExchange;
  const amExchangeResponder = !!exchange && mySeat === getPartner(exchange.fromPlayer);

  const handleDealChoice = (option) => dispatch({ type: 'dealChoice', option });
  const handlePackChoice = (packIndex) => dispatch({ type: 'packChoice', index: packIndex });
  const handleBid = (bid) => dispatch({ type: 'bid', value: bid });
  const handlePass = () => dispatch({ type: 'pass' });
  const handleRuutuBid = () => dispatch({ type: 'ruutuBid' });
  const handleTrumpChoice = (suit) => dispatch({ type: 'trump', suit });
  const handleNewRound = () => dispatch({ type: 'newRound' });
  const handleNewMatch = () => dispatch({ type: 'newMatch' });
  const handleExchangePictureClick = () => dispatch({ type: 'initiateExchange' });

  const closeMenu = () => { setMenuOpen(false); setMenuView('main'); };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!onCreateGame) return;
    const name = joinName.trim().slice(0, 12);
    try { localStorage.setItem(NAME_STORAGE_KEY, name); } catch { /* ignore */ }
    closeMenu();
    onCreateGame(name);
  };

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    const code = joinCode.replace(/\D/g, '');
    if (code.length !== 4 || !onJoinGame) return;
    const name = joinName.trim().slice(0, 12);
    try { localStorage.setItem(NAME_STORAGE_KEY, name); } catch { /* ignore */ }
    closeMenu();
    onJoinGame(code, name);
  };

  // Transient connection feedback shown as a toast (the menu closes on submit).
  const connectionMessage = () => {
    switch (status) {
      case 'connecting': return et.lobby.connecting;
      case 'error': return et.lobby.connectionError;
      case 'notfound': return et.lobby.notFound;
      case 'full': return et.lobby.roomFull;
      case 'disconnected': return et.lobby.disconnected;
      default: return null;
    }
  };
  const isConnecting = status === 'connecting';

  const handleOmale = () => {
    const currentHighBid = Math.max(0, ...gameState.bids.filter(b => b !== null));
    dispatch({ type: 'bid', value: currentHighBid });
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
      <div className="center-overlay deal-choice-overlay">
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
      <div className="center-overlay deal-choice-overlay">
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
                       gameState.phase === GAME_PHASES.ROUND_END ||
                       (gameState.phase === GAME_PHASES.GAME_END && !gameEndReady);

    if (!shouldShow) return null;

    // Place each seat by its position relative to the viewer (viewer at bottom)
    const positions = [0, 1, 2, 3].map((seat) => ({
      index: seat,
      position: RELATIVE_POS[relPos(seat)],
      name: seatName(seat)
    }));

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

        {/* Picture exchange is allowed as soon as cards are dealt, before the
            player has bid — even when it is not their turn. On their own turn
            the button is part of the bidding controls instead. */}
        {gameState.phase === GAME_PHASES.BIDDING &&
          !shouldShowBiddingControls() &&
          !gameState.pendingPictureExchange &&
          canExchangePicture(gameState, mySeat) && (
          <div className="bottom-overlay">
            <div className="overlay-content">
              <button className="exchange-button" onClick={handleExchangePictureClick}>
                {et.bidding.exchangePicture}
              </button>
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
    if (!gameEndReady) return null;

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

    const seatLabel = (seat) => (relPos(seat) === 2 ? et.lobby.seatPartner : et.lobby.seatOpponent);

    return (
      <div className="room-banner">
        <span className="room-code-label">{et.lobby.roomCode}</span>
        <span className="room-code-value">{roomCode}</span>
        <span className="room-players">
          {[2, 1, 3].map((seat) => {
            const connected = connectedSeats.includes(seat);
            const filledLabel = playerNames[seat] || '✓';
            return (
              <span
                key={seat}
                className={`room-seat ${connected ? 'filled' : 'ai'}`}
              >
                {seatLabel(seat)}: {connected ? filledLabel : et.lobby.empty}
              </span>
            );
          })}
        </span>
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
            onClick={() => { setMenuOpen(o => !o); setMenuView('main'); }}
          >
            ⚙
          </button>
          {menuOpen && (
            <div className="settings-dropdown">
              {menuView === 'main' && (
                <>
                  {onNewGame && (
                    <button
                      className="settings-item"
                      onClick={() => { closeMenu(); onNewGame(); }}
                    >
                      {et.gameEnd.newGame}
                    </button>
                  )}

                  {mode === 'single' && (
                    <>
                      <button
                        className="settings-item"
                        onClick={() => setMenuView('create')}
                        disabled={isConnecting}
                      >
                        {et.lobby.host}
                      </button>
                      <button
                        className="settings-item"
                        onClick={() => setMenuView('join')}
                      >
                        {et.lobby.join}
                      </button>
                    </>
                  )}

                  {(mode === 'host' || mode === 'client') && onLeaveNetwork && (
                    <button
                      className="settings-item"
                      onClick={() => { closeMenu(); onLeaveNetwork(); }}
                    >
                      {et.lobby.leaveNetwork}
                    </button>
                  )}
                </>
              )}

              {menuView === 'create' && (
                <form className="settings-join" onSubmit={handleCreateSubmit}>
                  <label className="settings-join-label" htmlFor="host-name">
                    {et.lobby.yourName}
                  </label>
                  <input
                    id="host-name"
                    className="settings-name-input"
                    type="text"
                    value={joinName}
                    maxLength={12}
                    autoComplete="off"
                    placeholder={et.lobby.namePlaceholder}
                    onChange={(e) => setJoinName(e.target.value)}
                  />
                  <div className="settings-join-actions">
                    <button
                      type="submit"
                      className="settings-item primary"
                      disabled={isConnecting}
                    >
                      {et.lobby.host}
                    </button>
                    <button
                      type="button"
                      className="settings-item"
                      onClick={() => setMenuView('main')}
                    >
                      {et.lobby.back}
                    </button>
                  </div>
                </form>
              )}

              {menuView === 'join' && (
                <form className="settings-join" onSubmit={handleJoinSubmit}>
                  <label className="settings-join-label" htmlFor="player-name">
                    {et.lobby.yourName}
                  </label>
                  <input
                    id="player-name"
                    className="settings-name-input"
                    type="text"
                    value={joinName}
                    maxLength={12}
                    autoComplete="off"
                    placeholder={et.lobby.namePlaceholder}
                    onChange={(e) => setJoinName(e.target.value)}
                  />
                  <label className="settings-join-label" htmlFor="room-code">
                    {et.lobby.enterCode}
                  </label>
                  <input
                    id="room-code"
                    className="settings-join-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={joinCode}
                    maxLength={4}
                    autoComplete="off"
                    placeholder="1234"
                    onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                  <div className="settings-join-actions">
                    <button
                      type="submit"
                      className="settings-item primary"
                      disabled={isConnecting || joinCode.length !== 4}
                    >
                      {et.lobby.connect}
                    </button>
                    <button
                      type="button"
                      className="settings-item"
                      onClick={() => setMenuView('main')}
                    >
                      {et.lobby.back}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </header>
      {connectionMessage() && (
        <div className={`connection-toast ${status}`}>{connectionMessage()}</div>
      )}
      {renderRoomBanner()}
      {renderGameEnd()}
      {renderDealChoice()}
      {renderPackChoice()}
      {renderPlayArea()}
    </div>
  );
}
