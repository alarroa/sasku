import Card from './Card';
import { sortHand } from '../game/cards';
import './Hand.css';

export default function Hand({ cards, onCardClick, canPlay, playerName, isCurrentPlayer, hidden }) {
  const sortedCards = sortHand(cards);

  return (
    <div className={`hand ${isCurrentPlayer ? 'current-player' : ''} ${hidden ? 'hidden-hand' : ''}`}>
      {playerName && <div className="player-name">{playerName}</div>}
      <div className="cards">
        {hidden ? (
          // Show card backs for hidden hands
          cards.map((card, index) => (
            <div key={index} className="card card-back">
              <div className="card-back-design">🂠</div>
            </div>
          ))
        ) : (
          sortedCards.map((card) => (
            <Card
              key={card.id}
              card={card}
              onClick={onCardClick}
              disabled={!canPlay || !isCurrentPlayer}
            />
          ))
        )}
      </div>
    </div>
  );
}
