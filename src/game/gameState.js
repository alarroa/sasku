import { createDeck, shuffleDeck, dealCards, SUITS, calculateBiddingValue } from './cards.js';

export const GAME_PHASES = {
  DEAL_CHOICE: 'deal_choice',
  PACK_CHOICE: 'pack_choice',
  BIDDING: 'bidding',
  PLAYING: 'playing',
  ROUND_END: 'round_end',
  GAME_END: 'game_end'
};

export const DEAL_OPTIONS = {
  TOSTAN: 'tostan',
  PIME_RUUTU: 'pime_ruutu',
  VALIDA: 'valida'
};

export function createInitialState() {
  return {
    phase: GAME_PHASES.DEAL_CHOICE,
    hands: [[], [], [], []],
    currentPlayer: 0, // Player after dealer (dealer is 3)
    dealer: 3,

    // Deal choice state
    dealOption: null,
    pimeRuutuBonus: false,
    cardPacks: null, // For "valida" option

    // Bidding state
    bids: [null, null, null, null],
    hasPassed: [false, false, false, false],
    lastBidder: null,
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

// Deal choice functions
export function chooseDealOption(state, option) {
  const newState = { ...state };
  newState.dealOption = option;

  if (option === DEAL_OPTIONS.TOSTAN) {
    // Normal deal - shuffle and deal cards
    const deck = shuffleDeck(createDeck());
    newState.hands = dealCards(deck);
    newState.phase = GAME_PHASES.BIDDING;
    newState.currentPlayer = getNextPlayer(state.dealer);
  } else if (option === DEAL_OPTIONS.PIME_RUUTU) {
    // Blind diamonds - deal cards but set trump to diamonds immediately
    const deck = shuffleDeck(createDeck());
    newState.hands = dealCards(deck);
    newState.trumpSuit = SUITS.DIAMONDS;
    newState.trumpMaker = state.currentPlayer;
    newState.pimeRuutuBonus = true;
    newState.phase = GAME_PHASES.PLAYING;
    newState.leadPlayer = getNextPlayer(state.dealer);
    newState.currentPlayer = newState.leadPlayer;
  } else if (option === DEAL_OPTIONS.VALIDA) {
    // Create 4 packs of 9 cards each
    const deck = shuffleDeck(createDeck());
    const packs = [];
    for (let i = 0; i < 4; i++) {
      const pack = deck.slice(i * 9, (i + 1) * 9);
      packs.push({
        cards: pack,
        topCard: pack[0],
        bottomCard: pack[8]
      });
    }
    newState.cardPacks = packs;
    newState.phase = GAME_PHASES.PACK_CHOICE;
  }

  return newState;
}

export function chooseCardPack(state, playerIndex, packIndex) {
  const newState = { ...state };

  // Give chosen pack to current player
  newState.hands = [...state.hands];
  newState.hands[playerIndex] = state.cardPacks[packIndex].cards;

  // Remove chosen pack from available packs
  const remainingPacks = state.cardPacks.filter((_, i) => i !== packIndex);

  // Distribute remaining packs to other players in order
  // Starting from next player after the chooser
  const chooserPosition = (playerIndex - getNextPlayer(state.dealer) + 4) % 4;
  const playerOrder = [];

  for (let i = 0; i < 4; i++) {
    if (i !== chooserPosition) {
      const actualPlayer = (getNextPlayer(state.dealer) + i) % 4;
      playerOrder.push(actualPlayer);
    }
  }

  playerOrder.forEach((player, index) => {
    if (index < remainingPacks.length) {
      newState.hands[player] = remainingPacks[index].cards;
    }
  });

  // Move to bidding phase
  newState.phase = GAME_PHASES.BIDDING;
  newState.currentPlayer = getNextPlayer(state.dealer);
  newState.cardPacks = null;

  return newState;
}

export function canMakeBid(state, playerIndex, bid) {
  if (state.hasPassed[playerIndex]) return false;

  const currentHighBid = Math.max(0, ...state.bids.filter(b => b !== null));
  const maxPossibleBid = calculateBiddingValue(state.hands[playerIndex]);

  // Can't bid higher than max possible
  if (bid > maxPossibleBid) return false;

  // Check if this is "Omale" - player before the last bidder can match current high bid
  // Find who made the bid before the current high bidder
  if (state.lastBidder !== null && bid === currentHighBid) {
    // Find the second highest bid to determine previous bidder
    const bidsWithPlayers = state.bids.map((b, i) => ({ bid: b, player: i }))
      .filter(b => b.bid !== null);

    if (bidsWithPlayers.length >= 2) {
      // Sort by bid value descending
      bidsWithPlayers.sort((a, b) => b.bid - a.bid);

      // If there are multiple bids at the highest value, find the one before current lastBidder
      const highestBids = bidsWithPlayers.filter(b => b.bid === currentHighBid);

      if (highestBids.length >= 1) {
        // Find the bidder who bid just before the last bidder
        for (let i = bidsWithPlayers.length - 1; i >= 0; i--) {
          if (bidsWithPlayers[i].bid < currentHighBid && bidsWithPlayers[i].player === playerIndex) {
            // This player made a bid before current high bid - can say "Omale"
            return true;
          }
        }
      }
    }
  }

  // Normal bid - must be higher than current
  return bid > currentHighBid;
}

export function makeBid(state, playerIndex, bid, isOmale = false) {
  const newState = { ...state };
  newState.bids = [...state.bids];
  newState.bids[playerIndex] = bid;
  newState.lastBidder = playerIndex;
  newState.currentPlayer = getNextPlayer(playerIndex);

  // If "Omale", reset passes to allow another round
  if (isOmale) {
    newState.hasPassed = [false, false, false, false];
  }

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
    const trumpCards = hand.filter(c => c.isPicture || c.suit === trumpSuit);
    if (trumpCards.length === 0) {
      // No trump - can play anything
      return true;
    }

    // Have trump - must play trump
    const cardIsTrump = card.isPicture || card.suit === trumpSuit;
    if (!cardIsTrump) return false;

    // Find the current highest card in the trick
    let highestCard = leadCard;
    for (let i = 1; i < state.currentTrick.length; i++) {
      const trickCard = state.currentTrick[i].card;
      if (isCardStronger(trickCard, highestCard, leadCard, trumpSuit)) {
        highestCard = trickCard;
      }
    }

    // Check if we can beat the highest card
    const canBeat = trumpCards.some(c => isCardStronger(c, highestCard, leadCard, trumpSuit));

    if (canBeat) {
      // Must beat if possible
      return isCardStronger(card, highestCard, leadCard, trumpSuit);
    } else {
      // Can't beat - can play any trump
      return cardIsTrump;
    }
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
      let points = 6;
      if (state.pimeRuutuBonus) points += 2; // Pime ruutu bonus
      state.gameScores[trumpMakerTeam] += points;
    } else if (trumpMakerTricks === 0) {
      // Defenders got all tricks (karvane)
      let points = 6;
      if (state.pimeRuutuBonus) points += 2; // Pime ruutu bonus goes to defenders
      state.gameScores[1 - trumpMakerTeam] += points;
    } else if (trumpMakerPoints >= 61) {
      // Trump maker won
      let points = state.trumpSuit === SUITS.DIAMONDS ? 4 : 2;
      if (defenderPoints < 30) points += 2; // Jänn
      if (state.pimeRuutuBonus) points += 2; // Pime ruutu bonus
      state.gameScores[trumpMakerTeam] += points;
    } else {
      // Trump was beaten
      let points = state.trumpSuit === SUITS.DIAMONDS ? 4 : 2;
      points += 2; // Bonus for beating opponent's trump
      if (trumpMakerPoints < 30) points += 2; // Jänn
      if (state.pimeRuutuBonus) points += 2; // Pime ruutu bonus goes to defenders
      state.gameScores[1 - trumpMakerTeam] += points;
    }
  }

  // Check for game end (16 points)
  if (state.gameScores[0] >= 16 || state.gameScores[1] >= 16) {
    state.phase = GAME_PHASES.GAME_END;
  }
}

export function startNewRound(state) {
  const newDealer = getNextPlayer(state.dealer);

  return {
    ...createInitialState(),
    dealer: newDealer,
    currentPlayer: getNextPlayer(newDealer),
    gameScores: state.gameScores,
    phase: GAME_PHASES.DEAL_CHOICE
  };
}
