import { calculateBiddingValue, SUITS, RANKS } from './cards.js';
import { canPlayCard, canMakeBid } from './gameState.js';

// ============================================================================
// CARD COUNTING AND TRACKING
// ============================================================================

function getPlayedCards(state) {
  const played = [];

  // Add cards from completed tricks
  state.tricksWon.forEach(playerTricks => {
    playerTricks.forEach(trick => {
      trick.forEach(play => played.push(play.card));
    });
  });

  // Add cards from current trick
  state.currentTrick.forEach(play => played.push(play.card));

  return played;
}

function countSuitPlayed(playedCards, suit) {
  return playedCards.filter(c => !c.isPicture && c.suit === suit).length;
}

// ============================================================================
// HAND EVALUATION UTILITIES
// ============================================================================

function evaluateHandStrength(hand) {
  let strength = 0;

  // Count high value cards
  const aces = hand.filter(c => !c.isPicture && c.rank === RANKS.ACE).length;
  const tens = hand.filter(c => !c.isPicture && c.rank === '10').length;
  const kings = hand.filter(c => c.rank === 'K').length;
  const queens = hand.filter(c => c.rank === 'Q').length;

  strength += aces * 3;      // Aces are very valuable
  strength += tens * 2.5;    // 10s are valuable
  strength += kings * 2;     // Kings are good
  strength += queens * 1.5;  // Queens are decent

  return strength;
}

function getSuitDistribution(hand) {
  const distribution = {};
  hand.forEach(card => {
    if (!card.isPicture) {
      distribution[card.suit] = (distribution[card.suit] || 0) + 1;
    }
  });
  return distribution;
}

function hasConcentratedSuits(hand) {
  const dist = getSuitDistribution(hand);
  const counts = Object.values(dist);
  // Good if at least one suit has 4+ cards, or two suits have 3+ cards
  return counts.some(c => c >= 4) || counts.filter(c => c >= 3).length >= 2;
}

function hasFourSuits(hand) {
  const dist = getSuitDistribution(hand);
  return Object.keys(dist).length === 4;
}

// ============================================================================
// IMPROVED BIDDING LOGIC
// ============================================================================

export function makeAIBid(state, playerIndex) {
  const hand = state.hands[playerIndex];
  const maxPossibleBid = calculateBiddingValue(hand);
  const currentHighBid = Math.max(0, ...state.bids.filter(b => b !== null));
  const minBid = Math.max(5, currentHighBid + 1);

  if (minBid > maxPossibleBid) {
    return null; // Pass
  }

  const handStrength = evaluateHandStrength(hand);
  const isDealer = playerIndex === state.dealer;
  const partnerIndex = (playerIndex + 2) % 4;
  const partnerBid = state.bids[partnerIndex];

  // Don't bid if hand is too weak
  if (hasFourSuits(hand) && handStrength < 8 && maxPossibleBid < 10) {
    return null; // Pass - spread hand with no strength
  }

  // If partner has already bid, be VERY conservative
  // Only outbid partner if we have significantly stronger hand
  if (partnerBid !== null && partnerBid > 0) {
    // Partner is bidding - only compete if our hand is much stronger
    if (handStrength < 12 || maxPossibleBid < partnerBid + 3) {
      return null; // Pass - let partner play
    }
  }

  // Be more aggressive if:
  // - We're dealer (advantage of leading)
  // - We have concentrated suits
  let bidThreshold = 7;

  if (isDealer) bidThreshold -= 1;
  if (hasConcentratedSuits(hand)) bidThreshold -= 1;

  // Bid if hand is strong enough
  if (handStrength >= bidThreshold && maxPossibleBid >= minBid) {
    // Don't overbid - bid conservatively
    const conservativeBid = Math.min(minBid, maxPossibleBid - 1);
    if (conservativeBid >= minBid && canMakeBid(state, playerIndex, conservativeBid)) {
      return conservativeBid;
    }
    if (canMakeBid(state, playerIndex, minBid)) {
      return minBid;
    }
  }

  // Opening bid if no one has bid yet
  if (currentHighBid === 0 && maxPossibleBid >= 6 && handStrength >= 5) {
    const openingBid = Math.min(maxPossibleBid - 2, 8);
    return Math.max(5, openingBid);
  }

  return null; // Pass
}

// ============================================================================
// IMPROVED TRUMP SELECTION
// ============================================================================

export function chooseAITrump(state, playerIndex) {
  const hand = state.hands[playerIndex];
  const myBid = state.bids[playerIndex];
  const pictures = hand.filter(card => card.isPicture).length;

  // Count non-picture cards by suit
  const suitCounts = {};
  hand.filter(card => !card.isPicture).forEach(card => {
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  });

  // Find all suits that allow the bid
  const requiredSuitCount = myBid - pictures;
  const validSuits = Object.keys(suitCounts).filter(suit =>
    suitCounts[suit] >= requiredSuitCount
  );

  // Diamonds can always be chosen
  if (!validSuits.includes(SUITS.DIAMONDS)) {
    validSuits.push(SUITS.DIAMONDS);
  }

  // Evaluate each valid suit based on strength
  let bestSuit = SUITS.DIAMONDS;
  let bestScore = -1;

  for (const suit of validSuits) {
    let score = 0;

    // Count high cards in this suit
    const suitCards = hand.filter(c => !c.isPicture && c.suit === suit);
    const hasAce = suitCards.some(c => c.rank === RANKS.ACE);
    const has10 = suitCards.some(c => c.rank === '10');
    const hasKing = hand.some(c => c.rank === 'K' && c.suit === suit);

    if (hasAce) score += 5;
    if (has10) score += 4;
    if (hasKing) score += 2;

    // Prefer longer suits
    score += suitCounts[suit];

    // Slight preference for traditional strong suits
    if (suit === SUITS.CLUBS) score += 0.5;
    if (suit === SUITS.SPADES) score += 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestSuit = suit;
    }
  }

  return bestSuit;
}

// ============================================================================
// IMPROVED CARD PLAYING LOGIC
// ============================================================================

export function chooseAICard(state, playerIndex) {
  const hand = state.hands[playerIndex];
  const legalCards = hand.filter(card => canPlayCard(state, playerIndex, card));

  if (legalCards.length === 0) return null;
  if (legalCards.length === 1) return legalCards[0];

  const isLeading = state.currentTrick.length === 0;
  const team = playerIndex % 2;
  const playedCards = getPlayedCards(state);

  if (isLeading) {
    return chooseLeadingCard(legalCards, hand, state, playedCards);
  } else {
    return chooseFollowingCard(legalCards, hand, state, playerIndex, team, playedCards);
  }
}

function chooseLeadingCard(legalCards, hand, state, playedCards) {
  // Strategy when leading:
  // 1. Lead Aces to clear them early and win tricks
  // 2. Lead from strongest suit
  // 3. Probe with low cards from weak suits

  const aces = legalCards.filter(c => !c.isPicture && c.rank === RANKS.ACE);
  if (aces.length > 0) {
    // Lead an Ace - choose from longest suit
    const suitCounts = {};
    aces.forEach(ace => {
      const count = hand.filter(c => !c.isPicture && c.suit === ace.suit).length;
      suitCounts[ace.suit] = count;
    });
    const bestAce = aces.reduce((best, ace) =>
      suitCounts[ace.suit] > suitCounts[best.suit] ? ace : best
    );
    return bestAce;
  }

  // Find strongest suit (most cards or high cards)
  const suitStrength = {};
  Object.values(SUITS).forEach(suit => {
    const suitCards = legalCards.filter(c => !c.isPicture && c.suit === suit);
    if (suitCards.length > 0) {
      let strength = suitCards.length;
      if (suitCards.some(c => c.rank === '10')) strength += 2;
      if (suitCards.some(c => c.rank === '9')) strength += 0.5;
      suitStrength[suit] = strength;
    }
  });

  const strongestSuit = Object.keys(suitStrength).reduce((best, suit) =>
    suitStrength[suit] > (suitStrength[best] || 0) ? suit : best
  , null);

  if (strongestSuit) {
    const strongSuitCards = legalCards.filter(c => !c.isPicture && c.suit === strongestSuit);
    // Lead highest card from strong suit
    if (strongSuitCards.length > 0) {
      return strongSuitCards[0];
    }
  }

  // Fallback: play lowest card
  return legalCards[legalCards.length - 1];
}

function chooseFollowingCard(legalCards, hand, state, playerIndex, team, playedCards) {
  const currentWinner = getCurrentTrickWinner(state);
  const winnerTeam = currentWinner % 2;
  const ourTeamIsWinning = winnerTeam === team;
  const isLastToPlay = state.currentTrick.length === 3;

  // Check for "2nd round 10" situation
  const leadCard = state.currentTrick[0].card;
  const suitPlayedCount = countSuitPlayed(playedCards, leadCard.suit);
  const ten = state.currentTrick.find(p => p.card.rank === '10' && !p.card.isPicture);

  if (ten && suitPlayedCount >= 4) {
    // This is 2nd round of this suit and someone played a 10
    // Try to trump it with highest trump if we can't follow suit
    const trumpCards = legalCards.filter(c =>
      (c.isPicture || c.suit === state.trumpSuit) && !c.suit === leadCard.suit
    );
    if (trumpCards.length > 0) {
      // Use highest trump to take the 10
      return trumpCards[0];
    }
  }

  // Try to win the trick
  const winningCards = legalCards.filter(card =>
    canWinTrick(state, card, playerIndex)
  );

  if (winningCards.length > 0) {
    // We can win - use LOWEST winning card (don't waste high cards)
    return winningCards[winningCards.length - 1];
  }

  // Can't win the trick
  if (ourTeamIsWinning && isLastToPlay) {
    // Partner is winning and we're last - give points!
    // But save Kings and Queens for later tricks (they can win more)
    const nonRoyalCards = legalCards.filter(c => c.rank !== 'K' && c.rank !== 'Q');
    if (nonRoyalCards.length > 0) {
      // Give highest points from non-royal cards
      const sortedByPoints = [...nonRoyalCards].sort((a, b) => b.points - a.points);
      return sortedByPoints[0];
    }
    // If only royals left, give highest points
    const sortedByPoints = [...legalCards].sort((a, b) => b.points - a.points);
    return sortedByPoints[0];
  } else if (ourTeamIsWinning) {
    // Partner is winning but we're not last - play safe middle card
    const sortedByPoints = [...legalCards].sort((a, b) => a.points - b.points);
    const midIndex = Math.floor(sortedByPoints.length / 2);
    return sortedByPoints[midIndex];
  } else {
    // Opponent is winning - play LOWEST card to save points
    const sortedByPoints = [...legalCards].sort((a, b) => a.points - b.points);
    return sortedByPoints[0];
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
