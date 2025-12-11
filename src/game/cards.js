// Sasku card definitions and utilities

// Suits in strength order (strongest first)
export const SUITS = {
  CLUBS: 'clubs',      // Risti (strongest)
  SPADES: 'spades',    // Poti
  HEARTS: 'hearts',    // Ärtu
  DIAMONDS: 'diamonds' // Ruutu (weakest)
};

export const SUIT_SYMBOLS = {
  [SUITS.CLUBS]: '♣',
  [SUITS.SPADES]: '♠',
  [SUITS.HEARTS]: '♥',
  [SUITS.DIAMONDS]: '♦'
};

export const SUIT_NAMES_ET = {
  [SUITS.CLUBS]: 'Risti',
  [SUITS.SPADES]: 'Poti',
  [SUITS.HEARTS]: 'Ärtu',
  [SUITS.DIAMONDS]: 'Ruutu'
};

// Ranks (in strength order for pictures and regular cards)
export const RANKS = {
  KING: 'K',
  QUEEN: 'Q',
  JACK: 'J',
  ACE: 'A',
  TEN: '10',
  NINE: '9',
  EIGHT: '8',
  SEVEN: '7',
  SIX: '6'
};

// Picture cards (always trumps)
export const PICTURES = [RANKS.KING, RANKS.QUEEN, RANKS.JACK];

// Point values
export const CARD_POINTS = {
  [RANKS.KING]: 4,
  [RANKS.QUEEN]: 3,
  [RANKS.JACK]: 2,
  [RANKS.ACE]: 11,
  [RANKS.TEN]: 10,
  [RANKS.NINE]: 0,
  [RANKS.EIGHT]: 0,
  [RANKS.SEVEN]: 0,
  [RANKS.SIX]: 0
};

// Card strength order (for comparing cards)
const RANK_STRENGTH = {
  [RANKS.KING]: 9,
  [RANKS.QUEEN]: 8,
  [RANKS.JACK]: 7,
  [RANKS.ACE]: 6,
  [RANKS.TEN]: 5,
  [RANKS.NINE]: 4,
  [RANKS.EIGHT]: 3,
  [RANKS.SEVEN]: 2,
  [RANKS.SIX]: 1
};

const SUIT_STRENGTH = {
  [SUITS.CLUBS]: 4,
  [SUITS.SPADES]: 3,
  [SUITS.HEARTS]: 2,
  [SUITS.DIAMONDS]: 1
};

export function createCard(suit, rank) {
  return {
    suit,
    rank,
    isPicture: PICTURES.includes(rank),
    points: CARD_POINTS[rank],
    id: `${suit}_${rank}`
  };
}

export function createDeck() {
  const deck = [];
  const suits = Object.values(SUITS);
  const ranks = Object.values(RANKS);

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push(createCard(suit, rank));
    }
  }

  return deck;
}

export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck) {
  // Deal 9 cards to each of 4 players
  return [
    deck.slice(0, 9),   // Player 0 (human)
    deck.slice(9, 18),  // Player 1
    deck.slice(18, 27), // Player 2
    deck.slice(27, 36)  // Player 3
  ];
}

// Compare two cards to determine which is stronger
// Returns positive if card1 wins, negative if card2 wins
export function compareCards(card1, card2, trumpSuit) {
  // Both are pictures - compare by suit strength first, then rank
  if (card1.isPicture && card2.isPicture) {
    if (card1.rank === card2.rank) {
      return SUIT_STRENGTH[card1.suit] - SUIT_STRENGTH[card2.suit];
    }
    return RANK_STRENGTH[card1.rank] - RANK_STRENGTH[card2.rank];
  }

  // One is a picture, one is not - picture always wins
  if (card1.isPicture) return 1;
  if (card2.isPicture) return -1;

  // Neither is a picture
  // If suits are different and one matches trump, trump wins
  if (card1.suit !== card2.suit) {
    if (card1.suit === trumpSuit) return 1;
    if (card2.suit === trumpSuit) return -1;
    // Different suits, neither trump - first card wins (must follow suit)
    return 0;
  }

  // Same suit - compare by rank
  return RANK_STRENGTH[card1.rank] - RANK_STRENGTH[card2.rank];
}

// Calculate bidding value for a hand
export function calculateBiddingValue(hand) {
  const pictures = hand.filter(card => card.isPicture).length;

  // Count cards by suit (excluding pictures)
  const suitCounts = {};
  hand.filter(card => !card.isPicture).forEach(card => {
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  });

  const longestSuit = Math.max(0, ...Object.values(suitCounts));

  return pictures + longestSuit;
}

// Sort hand for display
export function sortHand(hand, trumpSuit = null) {
  return [...hand].sort((a, b) => {
    // Pictures first
    if (a.isPicture && !b.isPicture) return -1;
    if (!a.isPicture && b.isPicture) return 1;

    // If both pictures, sort by rank first (K > Q > J), then by suit
    if (a.isPicture && b.isPicture) {
      if (a.rank !== b.rank) {
        return RANK_STRENGTH[b.rank] - RANK_STRENGTH[a.rank];
      }
      return SUIT_STRENGTH[b.suit] - SUIT_STRENGTH[a.suit];
    }

    // If both are regular cards
    // Trump suit cards come first (after pictures)
    if (trumpSuit) {
      const aIsTrump = a.suit === trumpSuit;
      const bIsTrump = b.suit === trumpSuit;

      if (aIsTrump && !bIsTrump) return -1;
      if (!aIsTrump && bIsTrump) return 1;
    }

    // Sort by suit then rank
    if (a.suit !== b.suit) {
      return SUIT_STRENGTH[b.suit] - SUIT_STRENGTH[a.suit];
    }
    return RANK_STRENGTH[b.rank] - RANK_STRENGTH[a.rank];
  });
}
