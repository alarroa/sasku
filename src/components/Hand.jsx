import Card from './Card';
import { sortHand } from '../game/cards';
import './Hand.css';

export default function Hand({ cards, onCardClick, canPlay, playerName, isCurrentPlayer }) {
  const sortedCards = sortHand(cards);

  return (
    <div className={`hand ${isCurrentPlayer ? 'current-player' : ''}`}>
      {playerName && <div className="player-name">{playerName}</div>}
      <div className="cards">
        {sortedCards.map((card) => (
          <Card
            key={card.id}
            card={card}
            onClick={onCardClick}
            disabled={!canPlay || !isCurrentPlayer}
          />
        ))}
      </div>
    </div>
  );
}
