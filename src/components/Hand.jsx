import Card from './Card';
import { sortHand } from '../game/cards';
import './Hand.css';

export default function Hand({ cards, onCardClick, canPlay, playerName, isCurrentPlayer, hidden, trumpSuit, canPlayCardFn }) {
  const sortedCards = sortHand(cards, trumpSuit);

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
          sortedCards.map((card) => {
            // Check if this specific card can be played
            const cardCanBePlayed = canPlay && isCurrentPlayer && canPlayCardFn && canPlayCardFn(card);

            return (
              <Card
                key={card.id}
                card={card}
                onClick={onCardClick}
                disabled={!cardCanBePlayed}
                trumpSuit={trumpSuit}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
