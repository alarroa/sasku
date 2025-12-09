import { SUIT_SYMBOLS, SUITS } from '../game/cards';
import './Card.css';

export default function Card({ card, onClick, selected, disabled }) {
  const isRed = card.suit === SUITS.HEARTS || card.suit === SUITS.DIAMONDS;

  return (
    <div
      className={`card ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${card.isPicture ? 'picture' : ''}`}
      onClick={() => !disabled && onClick && onClick(card)}
    >
      <div className="card-rank">{card.rank}</div>
      <div className="card-suit">{SUIT_SYMBOLS[card.suit]}</div>
      {card.isPicture && <div className="picture-badge">T</div>}
    </div>
  );
}
