import { calculateBiddingValue, SUITS, RANKS } from './cards.js';
import { canPlayCard, canMakeBid } from './gameState.js';

// Simple AI for bidding
export function makeAIBid(state, playerIndex) {
  const hand = state.hands[playerIndex];
  const maxPossibleBid = calculateBiddingValue(hand);

  // Get current high bid
  const currentHighBid = Math.max(0, ...state.bids.filter(b => b !== null));

  // Can't bid higher than max possible
  if (currentHighBid >= maxPossibleBid) {
    return null; // Pass
  }

  // Bid if value is good enough and can outbid current
  if (maxPossibleBid >= 7 && canMakeBid(state, playerIndex, currentHighBid + 1)) {
    return currentHighBid + 1;
  }

  // Consider bidding with slightly lower value if no one has bid yet
  if (currentHighBid === 0 && maxPossibleBid >= 5) {
    return Math.min(maxPossibleBid, 10);
  }

  return null; // Pass
}

// Choose trump suit
export function chooseAITrump(state, playerIndex) {
  const hand = state.hands[playerIndex];

  // Count non-picture cards by suit
  const suitCounts = {};
  hand.filter(card => !card.isPicture).forEach(card => {
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  });

  // Find the longest suit(s) - these are valid trump choices
  const maxSuitCount = Math.max(0, ...Object.values(suitCounts));
  const validSuits = Object.keys(suitCounts).filter(suit =>
    suitCounts[suit] === maxSuitCount
  );

  // Diamonds can always be chosen
  if (!validSuits.includes(SUITS.DIAMONDS)) {
    validSuits.push(SUITS.DIAMONDS);
  }

  // Choose the strongest valid suit
  const suitOrder = [SUITS.CLUBS, SUITS.SPADES, SUITS.HEARTS, SUITS.DIAMONDS];
  for (const suit of suitOrder) {
    if (validSuits.includes(suit)) {
      return suit;
    }
  }

  // Fallback to diamonds
  return SUITS.DIAMONDS;
}

// AI card playing logic
export function chooseAICard(state, playerIndex) {
  const hand = state.hands[playerIndex];
  const legalCards = hand.filter(card => canPlayCard(state, playerIndex, card));

  if (legalCards.length === 0) return null;
  if (legalCards.length === 1) return legalCards[0];

  const isLeading = state.currentTrick.length === 0;
  const partner = (playerIndex + 2) % 4;
  const team = playerIndex % 2;

  if (isLeading) {
    // Leading: try to play a strong card or low card
    // Prefer aces and tens for points
    const strongCards = legalCards.filter(card =>
      card.rank === RANKS.ACE || card.rank === RANKS.TEN || card.rank === RANKS.KING
    );

    if (strongCards.length > 0) {
      return strongCards[0];
    }

    // Otherwise play lowest card
    return legalCards[legalCards.length - 1];
  } else {
    // Following: smart play based on who's winning
    const currentWinner = getCurrentTrickWinner(state);
    const winnerTeam = currentWinner % 2;
    const ourTeamIsWinning = winnerTeam === team;

    // Try to win the trick
    const winningCards = legalCards.filter(card =>
      canWinTrick(state, card, playerIndex)
    );

    if (winningCards.length > 0) {
      // We can win - play the highest winning card
      return winningCards[0];
    }

    // Can't win the trick
    if (ourTeamIsWinning) {
      // Partner/teammate is winning - add high points!
      // Sort by points (descending) and play the highest point card
      const sortedByPoints = [...legalCards].sort((a, b) => b.points - a.points);
      return sortedByPoints[0];
    } else {
      // Opponent is winning - play lowest card to save points
      // Sort by points (ascending) and play the lowest point card
      const sortedByPoints = [...legalCards].sort((a, b) => a.points - b.points);
      return sortedByPoints[0];
    }
  }
}

function getCurrentTrickWinner(state) {
  if (state.currentTrick.length === 0) return null;

  const leadCard = state.currentTrick[0].card;
  const trumpSuit = state.trumpSuit;
  let winningPlay = state.currentTrick[0];

  for (let i = 1; i < state.currentTrick.length; i++) {
    const currentPlay = state.currentTrick[i];

    if (isCardStronger(currentPlay.card, winningPlay.card, leadCard, trumpSuit)) {
      winningPlay = currentPlay;
    }
  }

  return winningPlay.player;
}

function canWinTrick(state, card, playerIndex) {
  const leadCard = state.currentTrick[0]?.card;
  if (!leadCard) return true; // Leading, so always "wins"

  const trumpSuit = state.trumpSuit;

  // Check if this card beats all cards in current trick
  for (const play of state.currentTrick) {
    if (!isCardStronger(card, play.card, leadCard, trumpSuit)) {
      return false;
    }
  }

  return true;
}

function isCardStronger(card1, card2, leadCard, trumpSuit) {
  // Both pictures
  if (card1.isPicture && card2.isPicture) {
    const rankCompare = compareRanks(card1.rank, card2.rank);
    if (rankCompare !== 0) return rankCompare > 0;
    return getSuitStrength(card1.suit) > getSuitStrength(card2.suit);
  }

  // card1 is picture, card2 is not
  if (card1.isPicture) return true;
  if (card2.isPicture) return false;

  // Neither is picture
  // Check trump
  if (card1.suit === trumpSuit && card2.suit !== trumpSuit) return true;
  if (card2.suit === trumpSuit && card1.suit !== trumpSuit) return false;

  // Both trump or both not trump
  if (card1.suit === card2.suit) {
    return compareRanks(card1.rank, card2.rank) > 0;
  }

  // Different suits, neither trump
  // Must follow lead suit
  if (card1.suit === leadCard.suit) return true;
  if (card2.suit === leadCard.suit) return false;

  return false;
}

function compareRanks(rank1, rank2) {
  const order = ['K', 'Q', 'J', 'A', '10', '9', '8', '7', '6'];
  return order.indexOf(rank2) - order.indexOf(rank1);
}

function getSuitStrength(suit) {
  const strength = {
    [SUITS.CLUBS]: 4,
    [SUITS.SPADES]: 3,
    [SUITS.HEARTS]: 2,
    [SUITS.DIAMONDS]: 1
  };
  return strength[suit];
}
