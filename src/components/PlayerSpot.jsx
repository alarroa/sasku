import Card from './Card';
import { et } from '../i18n/et';

export default function PlayerSpot({
  position,
  name,
  cardCount,
  playedCard,
  isCurrentPlayer,
  isWinner,
  isPartner,
  trumpSuit,
  trumpIcon,
  isHuman,
  bidStatus
}) {
  const classes = [
    'player-spot',
    `player-${position}`,
    isCurrentPlayer ? 'active' : '',
    isWinner ? 'winner' : ''
  ].filter(Boolean).join(' ');

  const showStack = !isHuman && !playedCard && cardCount > 0;

  return (
    <div className={classes}>
      <div className="player-label">
        {name}{bidStatus}
        {trumpIcon && (
          <span className={`trump-icon trump-${trumpSuit}`}>
            {trumpIcon}
          </span>
        )}
      </div>

      {isPartner && !isHuman && (
        <div className="player-partner-badge">{et.players.partner}</div>
      )}

      {showStack && (
        <div className="player-stack" aria-hidden="true">
          <div className="player-stack-card" />
          <div className="player-stack-card" />
          <div className="player-stack-card" />
          <div className="player-stack-count">{cardCount}</div>
        </div>
      )}

      {playedCard && (
        <div className="player-card">
          <Card card={playedCard} trumpSuit={trumpSuit} />
        </div>
      )}
    </div>
  );
}
