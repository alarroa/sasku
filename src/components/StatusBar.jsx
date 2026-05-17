import { SUIT_NAMES_ET, SUIT_SYMBOLS } from '../game/cards';
import { et } from '../i18n/et';
import { GAME_PHASES } from '../game/gameState';
import { getTeam } from '../game/gameState';

export default function StatusBar({
  trumpSuit,
  trumpMaker,
  currentBid,
  phase,
  playerNames,
  activePlayer,
  hideBecauseBidding
}) {
  if (hideBecauseBidding) return null;

  // Don't show during round-end (info irrelevant or distracting)
  if (phase === GAME_PHASES.ROUND_END) return null;

  const showTrump = !!trumpSuit;
  const showBid = currentBid > 0 && trumpMaker !== null;
  const showActive = phase === GAME_PHASES.PLAYING && activePlayer !== null;

  if (!showTrump && !showBid && !showActive) return null;

  const trumpSymbol = trumpSuit ? SUIT_SYMBOLS[trumpSuit] : null;
  const trumpName = trumpSuit ? SUIT_NAMES_ET[trumpSuit] : null;
  const bidderTeam = trumpMaker !== null ? getTeam(trumpMaker) : null;
  const teamLabel = bidderTeam === 0 ? et.scoring.ourTeam : et.scoring.theirTeam;
  const activeName = activePlayer !== null ? playerNames[activePlayer] : null;

  return (
    <div className="status-bar">
      {showTrump && (
        <div className="status-bar-item">
          <span className="status-bar-label">Trump</span>
          <span className={`status-bar-value suit-${trumpSuit}`}>
            {trumpSymbol} {trumpName}
          </span>
        </div>
      )}
      {showTrump && showBid && <span className="status-bar-sep">·</span>}
      {showBid && (
        <div className="status-bar-item">
          <span className="status-bar-label">Bid</span>
          <span className="status-bar-value">
            {currentBid} · {teamLabel}
          </span>
        </div>
      )}
      {(showTrump || showBid) && showActive && <span className="status-bar-sep">·</span>}
      {showActive && (
        <div className="status-bar-item">
          <span className="status-bar-label">Kord</span>
          <span className="status-bar-value">{activeName}</span>
        </div>
      )}
    </div>
  );
}
