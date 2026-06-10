import { useCallback, useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import {
  createInitialState,
  GAME_PHASES,
  DEAL_OPTIONS,
  canPlayCard,
  playCard,
  makeBid,
  passBid,
  chooseTrump,
  chooseDealOption,
  chooseCardPack,
  startNewRound,
  startNewMatch,
  quickRuutuBid,
  exchangePicture,
  canExchangePicture,
  getPartner
} from '../game/gameState';
import { makeAIBid, chooseAITrump, chooseAICard } from '../game/ai';

const STORAGE_KEY = 'sasku-game-state';

// Prefix to namespace our peer ids on the public PeerJS broker
const CODE_PREFIX = 'sasku-';

// Seat assignment order for joining players:
// seat 0 = host, seat 2 = host's partner (first to join),
// seats 1 & 3 = opponents (join afterwards). Empty seats are AI.
const SEAT_ORDER = [2, 1, 3];

// Modes: 'single' | 'host' | 'client'. The app boots in 'single'; network play
// is started from the in-game menu. In 'single' and 'host' modes this peer owns
// the authoritative game state.

function makeRoomCode() {
  // 4-digit numeric code so phones show the number keypad
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += Math.floor(Math.random() * 10);
  }
  return code;
}

function loadSavedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const loadedState = JSON.parse(saved);
      if (!loadedState.matchWins) loadedState.matchWins = [0, 0];
      if (loadedState.pokkBonus === undefined) loadedState.pokkBonus = false;
      if (!loadedState.hasExchangedPicture) loadedState.hasExchangedPicture = [false, false, false, false];
      if (loadedState.pendingPictureExchange === undefined) loadedState.pendingPictureExchange = null;
      return loadedState;
    }
  } catch (error) {
    console.error('Failed to load game state:', error);
  }
  return null;
}

// Pick which card a partner gives back in a picture exchange: prefer a
// singleton suit (to create a void for trumping), else the lowest-value card.
function chooseGivebackCard(partnerHand) {
  const suitCounts = {};
  partnerHand.filter(c => !c.isPicture).forEach(c => {
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  });
  let cardToGive = partnerHand.find(c => !c.isPicture && suitCounts[c.suit] === 1);
  if (!cardToGive) {
    const sortedByValue = [...partnerHand].filter(c => !c.isPicture).sort((a, b) => a.points - b.points);
    cardToGive = sortedByValue[0];
  }
  return cardToGive;
}

// Apply a player's action to the game state. Pure and authoritative:
// guards ensure a player can only act on their own seat and turn.
function applyAction(state, seat, action) {
  if (!state || !action) return state;

  switch (action.type) {
    case 'dealChoice':
      if (state.phase !== GAME_PHASES.DEAL_CHOICE || state.currentPlayer !== seat) return state;
      return chooseDealOption(state, action.option);

    case 'packChoice':
      if (state.phase !== GAME_PHASES.PACK_CHOICE || state.currentPlayer !== seat) return state;
      return chooseCardPack(state, seat, action.index);

    case 'bid':
      if (state.phase !== GAME_PHASES.BIDDING || state.currentPlayer !== seat) return state;
      return makeBid(state, seat, action.value);

    case 'pass':
      if (state.phase !== GAME_PHASES.BIDDING || state.currentPlayer !== seat) return state;
      return passBid(state, seat);

    case 'ruutuBid':
      if (state.phase !== GAME_PHASES.BIDDING || state.currentPlayer !== seat) return state;
      return quickRuutuBid(state, seat);

    case 'initiateExchange': {
      // A player offers their single picture to their partner. Allowed at any
      // time during bidding (not just on the player's own turn), as long as
      // the player themself has not yet bid or passed (canExchangePicture).
      if (state.phase !== GAME_PHASES.BIDDING) return state;
      if (state.pendingPictureExchange) return state;
      if (!canExchangePicture(state, seat)) return state;
      const pictureCard = state.hands[seat].find(c => c.isPicture);
      if (!pictureCard) return state;
      return { ...state, pendingPictureExchange: { fromPlayer: seat, pictureCard } };
    }

    case 'exchangeGiveBack': {
      // The partner responds by choosing a (non-picture) card to give back.
      const pending = state.pendingPictureExchange;
      if (!pending) return state;
      if (seat !== getPartner(pending.fromPlayer)) return state;
      if (!action.card || action.card.isPicture) return state;
      if (!state.hands[seat].find(c => c.id === action.card.id)) return state;
      return exchangePicture(state, pending.fromPlayer, pending.pictureCard, action.card);
    }

    case 'trump':
      if (state.trumpMaker !== seat || state.trumpSuit) return state;
      return chooseTrump(state, action.suit);

    case 'playCard':
      if (state.phase !== GAME_PHASES.PLAYING || state.currentPlayer !== seat) return state;
      if (!canPlayCard(state, seat, action.card)) return state;
      return playCard(state, seat, action.card);

    case 'newRound':
      if (state.phase !== GAME_PHASES.ROUND_END) return state;
      return startNewRound(state);

    case 'newMatch':
      if (state.phase !== GAME_PHASES.GAME_END) return state;
      return startNewMatch(state);

    default:
      return state;
  }
}

export function usePeerGame() {
  // Boot straight into a single-player game (resuming any saved game). The old
  // landing menu is gone; network play is started from the in-game menu.
  const [mode, setMode] = useState('single');
  const [gameState, setGameState] = useState(() => loadSavedState() || createInitialState());
  const [mySeat, setMySeat] = useState(0);
  const [roomCode, setRoomCode] = useState(null);
  const [connectedSeats, setConnectedSeats] = useState([]);
  // Display name per seat (null = AI / no custom name). Joiners supply their own.
  const [playerNames, setPlayerNames] = useState([null, null, null, null]);
  const [status, setStatus] = useState(null);

  const peerRef = useRef(null);
  const connsRef = useRef(new Map()); // host: seat -> DataConnection
  const hostConnRef = useRef(null); // client: connection to host
  const gameStateRef = useRef(null);

  const isHost = mode === 'single' || mode === 'host';

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Persist single-player game to localStorage (networked games are transient)
  useEffect(() => {
    if (mode !== 'single' || !gameState) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
    } catch (error) {
      console.error('Failed to save game state:', error);
    }
  }, [gameState, mode]);

  // Host: broadcast authoritative state to all connected clients on every change
  useEffect(() => {
    if (mode !== 'host' || !gameState) return;
    connsRef.current.forEach((conn) => {
      if (conn.open) conn.send({ type: 'state', gameState });
    });
  }, [gameState, mode]);

  // Host: keep every client's view of the seat names in sync
  useEffect(() => {
    if (mode !== 'host') return;
    connsRef.current.forEach((conn) => {
      if (conn.open) conn.send({ type: 'names', names: playerNames });
    });
  }, [playerNames, mode]);

  // Host: drive AI for any seat that is not occupied by a human
  useEffect(() => {
    if (!isHost || !gameState) return;

    const humanSeats = mode === 'host' ? [0, ...connectedSeats] : [0];

    // A picture exchange is pending: if the partner who must respond is an AI,
    // let it pick a card to give back; otherwise wait for the human partner.
    if (gameState.pendingPictureExchange) {
      const responder = getPartner(gameState.pendingPictureExchange.fromPlayer);
      if (humanSeats.includes(responder)) return;

      const timer = setTimeout(() => {
        setGameState((prev) => {
          if (!prev || !prev.pendingPictureExchange) return prev;
          const { fromPlayer, pictureCard } = prev.pendingPictureExchange;
          const partner = getPartner(fromPlayer);
          const give = chooseGivebackCard(prev.hands[partner]);
          return give
            ? exchangePicture(prev, fromPlayer, pictureCard, give)
            : { ...prev, pendingPictureExchange: null };
        });
      }, 600);
      return () => clearTimeout(timer);
    }

    const cp = gameState.currentPlayer;
    if (humanSeats.includes(cp)) return; // wait for a human action

    const phase = gameState.phase;
    if (phase !== GAME_PHASES.DEAL_CHOICE &&
        phase !== GAME_PHASES.PACK_CHOICE &&
        phase !== GAME_PHASES.BIDDING &&
        phase !== GAME_PHASES.PLAYING) {
      return;
    }

    const trickJustCompleted = gameState.lastTrick &&
      gameState.lastTrick.trick.length === 4 &&
      gameState.currentTrick.length === 0;
    const delay = trickJustCompleted ? 2000 : 250;

    const timer = setTimeout(() => {
      setGameState((prev) => {
        if (!prev || prev.pendingPictureExchange) return prev;
        const player = prev.currentPlayer;
        if (humanSeats.includes(player)) return prev;

        if (prev.phase === GAME_PHASES.DEAL_CHOICE) {
          // 15% Pime Ruutu, 10% Valida, 75% Tõstan
          const rand = Math.random();
          if (rand < 0.15) return chooseDealOption(prev, DEAL_OPTIONS.PIME_RUUTU);
          if (rand < 0.25) return chooseDealOption(prev, DEAL_OPTIONS.VALIDA);
          return chooseDealOption(prev, DEAL_OPTIONS.TOSTAN);
        }
        if (prev.phase === GAME_PHASES.PACK_CHOICE) {
          const packIndex = Math.floor(Math.random() * prev.cardPacks.length);
          return chooseCardPack(prev, player, packIndex);
        }
        if (prev.phase === GAME_PHASES.BIDDING) {
          // A player who has passed stays out: just pass through quickly
          if (prev.hasPassed[player]) {
            return passBid(prev, player);
          }
          // Maybe initiate a picture exchange with the partner (70%)
          if (canExchangePicture(prev, player) && Math.random() < 0.7) {
            const pictureCard = prev.hands[player].find(c => c.isPicture);
            if (pictureCard) {
              return { ...prev, pendingPictureExchange: { fromPlayer: player, pictureCard } };
            }
          }
          if (prev.trumpMaker === player && !prev.trumpSuit) {
            return chooseTrump(prev, chooseAITrump(prev, player));
          }
          const bid = makeAIBid(prev, player);
          return bid !== null ? makeBid(prev, player, bid) : passBid(prev, player);
        }
        if (prev.phase === GAME_PHASES.PLAYING) {
          const card = chooseAICard(prev, player);
          if (card) return playCard(prev, player, card);
          // Fallback: play the first legal card if the AI returned nothing
          const fallback = prev.hands[player].find(c => canPlayCard(prev, player, c));
          return fallback ? playCard(prev, player, fallback) : prev;
        }
        return prev;
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [gameState, isHost, mode, connectedSeats]);

  // Host: auto-pass for a human seat that has already passed during bidding
  useEffect(() => {
    if (!isHost || !gameState) return;
    if (gameState.phase !== GAME_PHASES.BIDDING) return;
    if (gameState.pendingPictureExchange) return;

    const humanSeats = mode === 'host' ? [0, ...connectedSeats] : [0];
    const cp = gameState.currentPlayer;
    if (!humanSeats.includes(cp) || !gameState.hasPassed[cp]) return;

    const timer = setTimeout(() => {
      setGameState((prev) => {
        if (!prev || prev.phase !== GAME_PHASES.BIDDING) return prev;
        if (!prev.hasPassed[prev.currentPlayer]) return prev;
        return passBid(prev, prev.currentPlayer);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [gameState, isHost, mode, connectedSeats]);

  const cleanupPeer = useCallback(() => {
    connsRef.current.forEach((conn) => {
      try { conn.close(); } catch { /* ignore */ }
    });
    connsRef.current.clear();
    if (hostConnRef.current) {
      // Tell the host we're leaving so it can hand our seat to the AI right
      // away, without waiting on WebRTC's (unreliable) close detection.
      try {
        if (hostConnRef.current.open) hostConnRef.current.send({ type: 'leave' });
      } catch { /* ignore */ }
      try { hostConnRef.current.close(); } catch { /* ignore */ }
      hostConnRef.current = null;
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch { /* ignore */ }
      peerRef.current = null;
    }
  }, []);

  const dispatch = useCallback((action) => {
    if (isHost) {
      // Host's local human always occupies seat 0
      setGameState((prev) => applyAction(prev, 0, action));
    } else if (hostConnRef.current && hostConnRef.current.open) {
      hostConnRef.current.send({ type: 'action', action });
    }
  }, [isHost]);

  const startSingle = useCallback(() => {
    cleanupPeer();
    setMode('single');
    setMySeat(0);
    setConnectedSeats([]);
    setPlayerNames([null, null, null, null]);
    setRoomCode(null);
    setStatus(null);
    setGameState(loadSavedState() || createInitialState());
  }, [cleanupPeer]);

  const resetGame = useCallback(() => {
    if (!isHost) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setGameState(createInitialState());
  }, [isHost]);

  const createGame = useCallback((name) => {
    cleanupPeer();
    setStatus('connecting');
    setConnectedSeats([]);
    const hostName = typeof name === 'string' ? name.trim().slice(0, 12) : '';
    setPlayerNames([hostName || null, null, null, null]);

    const attempt = () => {
      const code = makeRoomCode();
      const peer = new Peer(CODE_PREFIX + code);
      peerRef.current = peer;

      peer.on('open', () => {
        setRoomCode(code);
        setMySeat(0);
        setMode('host');
        setStatus('ready');
        // Networked games always start fresh (single-player save is left intact)
        setGameState(createInitialState());
      });

      peer.on('error', (err) => {
        if (err && err.type === 'unavailable-id') {
          // Room code collision on the broker - try another one
          try { peer.destroy(); } catch { /* ignore */ }
          attempt();
          return;
        }
        console.error('Peer error:', err);
        setStatus('error');
      });

      peer.on('connection', (conn) => {
        conn.on('open', () => {
          const occupied = Array.from(connsRef.current.keys());
          const seat = SEAT_ORDER.find((s) => !occupied.includes(s));

          if (seat === undefined) {
            conn.send({ type: 'full' });
            setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 200);
            return;
          }

          connsRef.current.set(seat, conn);
          setConnectedSeats(Array.from(connsRef.current.keys()));

          // The joiner's chosen name travels in the connection metadata.
          const rawName = conn.metadata && typeof conn.metadata.name === 'string'
            ? conn.metadata.name.trim().slice(0, 12)
            : '';
          setPlayerNames((prev) => {
            const next = [...prev];
            next[seat] = rawName || null;
            return next;
          });

          conn.send({ type: 'welcome', seat });
          conn.send({ type: 'state', gameState: gameStateRef.current });

          // Free this seat (idempotent) so the AI driver takes it over. Used by
          // every disconnect path below — graceful leave, close, error, or a
          // dropped ICE connection — regardless of which seat (partner or
          // opponent) the player occupied.
          const releaseSeat = () => {
            if (connsRef.current.get(seat) !== conn) return;
            try { conn.close(); } catch { /* ignore */ }
            connsRef.current.delete(seat);
            setConnectedSeats(Array.from(connsRef.current.keys()));
            setPlayerNames((prev) => {
              if (!prev[seat]) return prev;
              const next = [...prev];
              next[seat] = null;
              return next;
            });
          };

          conn.on('data', (data) => {
            if (data && data.type === 'action') {
              setGameState((prev) => applyAction(prev, seat, data.action));
            } else if (data && data.type === 'leave') {
              releaseSeat();
            }
          });

          conn.on('close', releaseSeat);
          conn.on('error', releaseSeat);
          // WebRTC's 'close' is unreliable when a tab is closed abruptly; the
          // ICE state change is the dependable signal for a vanished peer.
          conn.on('iceStateChanged', (state) => {
            if (state === 'disconnected' || state === 'failed' || state === 'closed') {
              releaseSeat();
            }
          });
        });
      });
    };

    attempt();
  }, [cleanupPeer]);

  const joinGame = useCallback((code, name) => {
    if (!code) return;
    cleanupPeer();
    setStatus('connecting');
    setPlayerNames([null, null, null, null]);

    const myName = typeof name === 'string' ? name.trim().slice(0, 12) : '';

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      const hostId = CODE_PREFIX + code.trim().toUpperCase();
      const conn = peer.connect(hostId, { reliable: true, metadata: { name: myName } });
      hostConnRef.current = conn;

      conn.on('open', () => setStatus('connected'));

      conn.on('data', (data) => {
        if (!data) return;
        if (data.type === 'welcome') {
          setMySeat(data.seat);
          setRoomCode(code.trim().toUpperCase());
          setMode('client');
          setStatus('connected');
        } else if (data.type === 'state') {
          setGameState(data.gameState);
        } else if (data.type === 'names') {
          setPlayerNames(data.names);
        } else if (data.type === 'full') {
          setStatus('full');
        }
      });

      conn.on('close', () => setStatus('disconnected'));
      conn.on('error', (err) => {
        console.error('Connection error:', err);
        setStatus('error');
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      // peer-unavailable means the room code doesn't exist
      setStatus(err && err.type === 'peer-unavailable' ? 'notfound' : 'error');
    });
  }, [cleanupPeer]);

  // Clean up the peer connection when the component unmounts
  useEffect(() => cleanupPeer, [cleanupPeer]);

  return {
    mode,
    isHost,
    gameState,
    mySeat,
    roomCode,
    connectedSeats,
    playerNames,
    status,
    dispatch,
    startSingle,
    createGame,
    joinGame,
    resetGame
  };
}
