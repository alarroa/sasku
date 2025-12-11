import { createDeck, shuffleDeck, dealCards, SUITS, calculateBiddingValue } from './cards.js';

export const GAME_PHASES = {
  BIDDING: 'bidding',
  PICTURE_GIVING: 'picture_giving',
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

    // Picture giving state
    pictureGivingOffer: null,
    pictureGivingCard: null,

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

  // Check if picture giving is possible
  const trumpMakerHand = newState.hands[newState.trumpMaker];
  const pictures = trumpMakerHand.filter(card => card.isPicture);
  const partnerIndex = getPartner(newState.trumpMaker);
  const partnerPictures = newState.hands[partnerIndex].filter(card => card.isPicture);

  // Can give picture if: has exactly 1 picture and partner doesn't have 9 pictures
  if (pictures.length === 1 && partnerPictures.length < 9) {
    newState.phase = GAME_PHASES.PICTURE_GIVING;
    newState.currentPlayer = newState.trumpMaker;
  } else {
    newState.phase = GAME_PHASES.PLAYING;
    newState.leadPlayer = getNextPlayer(newState.dealer);
    newState.currentPlayer = newState.leadPlayer;
  }

  return newState;
}

export function canPlayCard(state, playerIndex, card) {
  if (state.currentPlayer !== playerIndex) return false;

  const hand = state.hands[playerIndex];
  if (!hand.find(c => c.id === card.id)) return false;

  // First card of trick - can play anything
  if (state.currentTrick.length === 0) return true;

  const leadCard = state.currentTrick[0].card;

  // Trumbi ülelöömise kohustust ei ole, masti kaotamine on lubatud
  // This means: no obligation to beat trump/suit, you can throw away

  if (leadCard.isPicture) {
    // If lead is picture, must play picture if have one
    // BUT: no need to beat it - can play any picture
    const hasPictures = hand.some(c => c.isPicture);
    if (hasPictures && !card.isPicture) return false;
    // If playing a picture, it's valid (no need to check if it beats lead)
    if (card.isPicture) return true;
    // If no pictures, can play anything
    return !hasPictures;
  } else {
    // If lead is non-picture, must follow suit if possible
    const hasSuit = hand.some(c => !c.isPicture && c.suit === leadCard.suit);
    if (hasSuit) {
      // Must play same suit if have it, but can be any card of that suit
      return !card.isPicture && card.suit === leadCard.suit;
    }
    // If don't have the suit, can play anything (including pictures/trump)
    return true;
  }
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
      state.gameScores[0] += 1;
    } else if (teamPoints[1] > teamPoints[0]) {
      state.gameScores[1] += 1;
    }
    // Pokk (tie) - no points, play again
  } else {
    const trumpMakerPoints = teamPoints[trumpMakerTeam];
    const defenderPoints = teamPoints[1 - trumpMakerTeam];

    // Check for karvane (one team got no tricks)
    const trumpMakerTricks = state.tricksWon[state.trumpMaker].length +
                             state.tricksWon[getPartner(state.trumpMaker)].length;

    if (trumpMakerTricks === 9) {
      // Trump maker got all tricks
      state.gameScores[trumpMakerTeam] += 6;
    } else if (trumpMakerTricks === 0) {
      // Defenders got all tricks
      state.gameScores[1 - trumpMakerTeam] += 6;
    } else if (trumpMakerPoints >= 61) {
      // Trump maker won
      let points = state.trumpSuit === SUITS.DIAMONDS ? 2 : 1;
      if (defenderPoints < 31) points += 1; // Jänn
      state.gameScores[trumpMakerTeam] += points;
    } else {
      // Trump was beaten
      let points = state.trumpSuit === SUITS.DIAMONDS ? 4 : 2;
      if (trumpMakerPoints < 31) points += 1; // Jänn
      state.gameScores[1 - trumpMakerTeam] += points;
    }
  }

  // Check for game end (12 points)
  if (state.gameScores[0] >= 12 || state.gameScores[1] >= 12) {
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
