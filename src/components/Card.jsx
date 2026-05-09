import * as deck from '@letele/playing-cards';
import { SUITS } from '../game/cards';
import './Card.css';

const SUIT_LETTER = {
  [SUITS.CLUBS]: 'C',
  [SUITS.SPADES]: 'S',
  [SUITS.HEARTS]: 'H',
  [SUITS.DIAMONDS]: 'D'
};

const RANK_TOKEN = {
  K: 'k',
  Q: 'q',
  J: 'j',
  A: 'a'
};

function getCardComponent(card) {
  const suit = SUIT_LETTER[card.suit];
  const rank = RANK_TOKEN[card.rank] ?? card.rank;
  return deck[`${suit}${rank}`];
}

export default function Card({ card, onClick, selected, disabled, active, trumpSuit }) {
  const isTrump = card.isPicture || (trumpSuit && card.suit === trumpSuit);
  const SvgCard = getCardComponent(card);

  return (
    <div
      className={`card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${active ? 'active' : ''} ${card.isPicture ? 'picture' : ''} ${isTrump ? 'trump' : ''}`}
      onClick={() => !disabled && onClick && onClick(card)}
    >
      <div className="card-svg-wrapper">
        {SvgCard ? <SvgCard style={{ width: '100%', height: '100%', display: 'block' }} /> : null}
      </div>
    </div>
  );
}
