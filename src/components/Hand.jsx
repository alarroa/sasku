import Card from './Card';
import { sortHand } from '../game/cards';
import './Hand.css';

export default function Hand({ cards, onCardClick, canPlay, isCurrentPlayer, hidden, trumpSuit, canPlayCardFn, isBidding }) {
  const sortedCards = sortHand(cards, trumpSuit);

  return (
    <div className={`hand ${isCurrentPlayer ? 'current-player' : ''} ${hidden ? 'hidden-hand' : ''}`}>
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

            // During bidding, cards should be disabled (cannot be played)
            const isDisabled = isBidding ? true : !cardCanBePlayed;

            return (
              <Card
                key={card.id}
                card={card}
                onClick={onCardClick}
                disabled={isDisabled}
                active={isBidding}
                trumpSuit={trumpSuit}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
