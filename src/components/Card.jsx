import { SUIT_SYMBOLS, SUITS } from '../game/cards';
import './Card.css';

export default function Card({ card, onClick, selected, disabled, trumpSuit }) {
  const isRed = card.suit === SUITS.HEARTS || card.suit === SUITS.DIAMONDS;
  const isTrump = card.isPicture || (trumpSuit && card.suit === trumpSuit);

  return (
    <div
      className={`card ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${card.isPicture ? 'picture' : ''}`}
      onClick={() => !disabled && onClick && onClick(card)}
    >
      <div className="card-rank">{card.rank}</div>
      <div className="card-suit">{SUIT_SYMBOLS[card.suit]}</div>
      {isTrump && <div className="picture-badge">T</div>}
    </div>
  );
}
