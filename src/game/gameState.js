import { createDeck, shuffleDeck, dealCards, SUITS, calculateBiddingValue } from './cards.js';

export const GAME_PHASES = {
  BIDDING: 'bidding',
  PLAYING: 'playing',
  ROUND_END: 'round_end',
  GAME_END: 'game_end'
};

export function createInitialState() {
  const deck = shuffleDeck(createDeck());
  const hands = dealCards(deck);

  return {
    phase: GAME_PHASES.BIDDING,
    hands: hands,
    currentPlayer: 0,
    dealer: 0,

    // Bidding state
    bids: [null, null, null, null],
    hasPassed: [false, false, false, false],
    trumpSuit: null,
    trumpMaker: null,

    // Playing state
    currentTrick: [],
    leadPlayer: null,
    tricksWon: [[], [], [], []],

    // Scoring
    roundScores: [0, 0], // Team 0 (players 0&2) vs Team 1 (players 1&3)
    gameScores: [0, 0],

    // History
    lastTrick: null
  };
}

export function getTeam(playerIndex) {
  return playerIndex % 2; // 0 and 2 are team 0, 1 and 3 are team 1
}

export function getPartner(playerIndex) {
  return (playerIndex + 2) % 4;
}

export function getNextPlayer(currentPlayer) {
  return (currentPlayer + 1) % 4;
}

export function canMakeBid(state, playerIndex, bid) {
  if (state.hasPassed[playerIndex]) return false;

  const currentHighBid = Math.max(0, ...state.bids.filter(b => b !== null));
  const maxPossibleBid = calculateBiddingValue(state.hands[playerIndex]);

  return bid > currentHighBid && bid <= maxPossibleBid;
}

export function makeBid(state, playerIndex, bid) {
  const newState = { ...state };
  newState.bids = [...state.bids];
  newState.bids[playerIndex] = bid;
  newState.currentPlayer = getNextPlayer(playerIndex);
  return newState;
}

export function passBid(state, playerIndex) {
  const newState = { ...state };
  newState.hasPassed = [...state.hasPassed];
  newState.hasPassed[playerIndex] = true;
  newState.currentPlayer = getNextPlayer(playerIndex);

  // Check if bidding is over
  const passCount = newState.hasPassed.filter(p => p).length;

  // All passed - default to üleküla ruutu (diamonds over the village)
  if (passCount === 4) {
    newState.trumpSuit = SUITS.DIAMONDS;
    newState.trumpMaker = null; // No one made trump
    newState.phase = GAME_PHASES.PLAYING;
    newState.leadPlayer = getNextPlayer(newState.dealer);
    newState.currentPlayer = newState.leadPlayer;
  }
  // Three passed - winner determined
  else if (passCount === 3) {
    const winnerIndex = newState.bids.findIndex((bid, i) => bid !== null && !newState.hasPassed[i]);
    newState.trumpMaker = winnerIndex;
    newState.currentPlayer = winnerIndex;
    // Trump will be chosen by AI or shown to human
    // For now, stay in BIDDING phase until trump is chosen
    // Or automatically choose for AI
  }

  return newState;
}

export function chooseTrump(state, suit) {
  const newState = { ...state };
  newState.trumpSuit = suit;

  // Start playing phase
  newState.phase = GAME_PHASES.PLAYING;
  newState.leadPlayer = getNextPlayer(newState.dealer);
  newState.currentPlayer = newState.leadPlayer;

  return newState;
}

export function canPlayCard(state, playerIndex, card) {
  if (state.currentPlayer !== playerIndex) return false;

  const hand = state.hands[playerIndex];
  if (!hand.find(c => c.id === card.id)) return false;

  // First card of trick - can play anything
  if (state.currentTrick.length === 0) return true;

  const leadCard = state.currentTrick[0].card;
  const trumpSuit = state.trumpSuit;

  // Check if lead card is trump (picture or trump suit)
  const leadIsTrump = leadCard.isPicture || leadCard.suit === trumpSuit;

  if (leadIsTrump) {
    // If lead is trump (picture or trump suit card)
    // Must play trump if have one (picture or trump suit)
    const trumpCards = hand.filter(c => c.isPicture || c.suit === trumpSuit);

    if (trumpCards.length === 0) {
      // No trump cards - can play anything
      return true;
    }

    // Have trump cards - must play trump
    const cardIsTrump = card.isPicture || card.suit === trumpSuit;
    if (!cardIsTrump) return false;

    // Find the current highest trump in the trick
    let highestTrump = leadCard;
    for (let i = 1; i < state.currentTrick.length; i++) {
      const trickCard = state.currentTrick[i].card;
      if (isCardStronger(trickCard, highestTrump, leadCard, trumpSuit)) {
        highestTrump = trickCard;
      }
    }

    // Check if we can beat the highest trump
    const canBeat = trumpCards.some(c => isCardStronger(c, highestTrump, leadCard, trumpSuit));

    if (canBeat) {
      // Must beat if possible
      return isCardStronger(card, highestTrump, leadCard, trumpSuit);
    } else {
      // Can't beat - can play any trump
      return cardIsTrump;
    }
  } else {
    // If lead is non-trump regular card, must follow suit if possible
    const hasSuit = hand.some(c => !c.isPicture && c.suit === leadCard.suit);
    if (hasSuit) {
      // Must play same suit if have it
      return !card.isPicture && card.suit === leadCard.suit;
    }

    // Don't have the suit - must play trump (picture or trump suit) if have any
    const hasTrump = hand.some(c => c.isPicture || c.suit === trumpSuit);
    if (hasTrump) {
      // Must play trump (picture or trump suit)
      return card.isPicture || card.suit === trumpSuit;
    }

    // Don't have suit, trump, or pictures - can play anything
    return true;
  }
}

// Helper function to check if card1 is stronger than card2
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

export function playCard(state, playerIndex, card) {
  const newState = { ...state };

  // Remove card from hand
  newState.hands = state.hands.map((hand, i) =>
    i === playerIndex ? hand.filter(c => c.id !== card.id) : hand
  );

  // Add to current trick
  newState.currentTrick = [...state.currentTrick, { player: playerIndex, card }];

  // If trick is complete (4 cards)
  if (newState.currentTrick.length === 4) {
    // Determine winner
    const winner = determineTrickWinner(newState.currentTrick, state.trumpSuit);

    // Add trick to winner's tricks
    newState.tricksWon = state.tricksWon.map((tricks, i) =>
      i === winner ? [...tricks, newState.currentTrick] : tricks
    );

    newState.lastTrick = {
      trick: newState.currentTrick,
      winner
    };

    newState.currentTrick = [];
    newState.leadPlayer = winner;
    newState.currentPlayer = winner;

    // Check if round is over (all cards played)
    if (newState.hands[0].length === 0) {
      newState.phase = GAME_PHASES.ROUND_END;
      calculateRoundScore(newState);
    }
  } else {
    newState.currentPlayer = getNextPlayer(playerIndex);
  }

  return newState;
}

function determineTrickWinner(trick, trumpSuit) {
  const leadCard = trick[0].card;
  let winningPlay = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const currentPlay = trick[i];

    // Both pictures
    if (winningPlay.card.isPicture && currentPlay.card.isPicture) {
      // Compare rank first
      const rankCompare = compareRanks(currentPlay.card.rank, winningPlay.card.rank);
      if (rankCompare > 0) {
        winningPlay = currentPlay;
      } else if (rankCompare === 0) {
        // Same rank - compare suit strength
        if (getSuitStrength(currentPlay.card.suit) > getSuitStrength(winningPlay.card.suit)) {
          winningPlay = currentPlay;
        }
      }
    }
    // Current is picture, winning is not
    else if (currentPlay.card.isPicture && !winningPlay.card.isPicture) {
      winningPlay = currentPlay;
    }
    // Winning is picture, current is not - winning stays
    else if (winningPlay.card.isPicture && !currentPlay.card.isPicture) {
      continue;
    }
    // Neither is picture
    else {
      // Check trump
      if (currentPlay.card.suit === trumpSuit && winningPlay.card.suit !== trumpSuit) {
        winningPlay = currentPlay;
      } else if (currentPlay.card.suit === trumpSuit && winningPlay.card.suit === trumpSuit) {
        // Both trump - compare rank
        if (compareRanks(currentPlay.card.rank, winningPlay.card.rank) > 0) {
          winningPlay = currentPlay;
        }
      } else if (currentPlay.card.suit === leadCard.suit && winningPlay.card.suit === leadCard.suit) {
        // Both following lead suit - compare rank
        if (compareRanks(currentPlay.card.rank, winningPlay.card.rank) > 0) {
          winningPlay = currentPlay;
        }
      }
    }
  }

  return winningPlay.player;
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

function calculateRoundScore(state) {
  // Count points for each team
  const teamPoints = [0, 0];

  state.tricksWon.forEach((tricks, playerIndex) => {
    const team = getTeam(playerIndex);
    tricks.forEach(trick => {
      trick.forEach(play => {
        teamPoints[team] += play.card.points;
      });
    });
  });

  state.roundScores = teamPoints;

  // Determine round winner and calculate game points
  const trumpMakerTeam = state.trumpMaker !== null ? getTeam(state.trumpMaker) : null;

  // Üleküla ruutu (no trump maker)
  if (trumpMakerTeam === null) {
    if (teamPoints[0] > teamPoints[1]) {
      state.gameScores[0] += 2;
    } else if (teamPoints[1] > teamPoints[0]) {
      state.gameScores[1] += 2;
    }
    // Pokk (tie) - no points, play again
  } else {
    const trumpMakerPoints = teamPoints[trumpMakerTeam];
    const defenderPoints = teamPoints[1 - trumpMakerTeam];

    // Check for karvane (one team got all tricks)
    const trumpMakerTricks = state.tricksWon[state.trumpMaker].length +
                             state.tricksWon[getPartner(state.trumpMaker)].length;

    if (trumpMakerTricks === 9) {
      // Trump maker got all tricks (karvane)
      state.gameScores[trumpMakerTeam] += 6;
    } else if (trumpMakerTricks === 0) {
      // Defenders got all tricks (karvane)
      state.gameScores[1 - trumpMakerTeam] += 6;
    } else if (trumpMakerPoints >= 61) {
      // Trump maker won
      let points = state.trumpSuit === SUITS.DIAMONDS ? 4 : 2;
      if (defenderPoints < 30) points += 2; // Jänn
      state.gameScores[trumpMakerTeam] += points;
    } else {
      // Trump was beaten
      let points = state.trumpSuit === SUITS.DIAMONDS ? 4 : 2;
      points += 2; // Bonus for beating opponent's trump
      if (trumpMakerPoints < 30) points += 2; // Jänn
      state.gameScores[1 - trumpMakerTeam] += points;
    }
  }

  // Check for game end (16 points)
  if (state.gameScores[0] >= 16 || state.gameScores[1] >= 16) {
    state.phase = GAME_PHASES.GAME_END;
  }
}

export function startNewRound(state) {
  const deck = shuffleDeck(createDeck());
  const hands = dealCards(deck);
  const newDealer = getNextPlayer(state.dealer);

  return {
    ...createInitialState(),
    hands,
    dealer: newDealer,
    currentPlayer: getNextPlayer(newDealer),
    gameScores: state.gameScores
  };
}
