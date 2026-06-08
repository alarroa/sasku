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
  quickRuutuBid
} from '../game/gameState';
import { makeAIBid, chooseAITrump, chooseAICard } from '../game/ai';

const STORAGE_KEY = 'sasku-game-state';

// Prefix to namespace our peer ids on the public PeerJS broker
const CODE_PREFIX = 'sasku-';

// Seat assignment order for joining players:
// seat 0 = host, seat 2 = host's partner (first to join),
// seats 1 & 3 = opponents (join afterwards). Empty seats are AI.
const SEAT_ORDER = [2, 1, 3];

// Modes: 'menu' | 'single' | 'host' | 'client'
// In 'single' and 'host' modes this peer owns the authoritative game state.

function makeRoomCode() {
  // Avoid ambiguous characters (0/O, 1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
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
      return loadedState;
    }
  } catch (error) {
    console.error('Failed to load game state:', error);
  }
  return null;
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
      return makeBid(state, seat, action.value, action.omale === true);

    case 'pass':
      if (state.phase !== GAME_PHASES.BIDDING || state.currentPlayer !== seat) return state;
      return passBid(state, seat);

    case 'ruutuBid':
      if (state.phase !== GAME_PHASES.BIDDING || state.currentPlayer !== seat) return state;
      return quickRuutuBid(state, seat);

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
  const [mode, setMode] = useState('menu');
  const [gameState, setGameState] = useState(null);
  const [mySeat, setMySeat] = useState(0);
  const [roomCode, setRoomCode] = useState(null);
  const [connectedSeats, setConnectedSeats] = useState([]);
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

  // Host: drive AI for any seat that is not occupied by a human
  useEffect(() => {
    if (!isHost || !gameState) return;

    const humanSeats = mode === 'host' ? [0, ...connectedSeats] : [0];
    const cp = gameState.currentPlayer;
    if (humanSeats.includes(cp)) return; // wait for a human action

    // Skip phases with no AI decision to make
    const phase = gameState.phase;
    if (phase !== GAME_PHASES.DEAL_CHOICE &&
        phase !== GAME_PHASES.BIDDING &&
        phase !== GAME_PHASES.PLAYING) {
      return;
    }

    const trickJustCompleted = gameState.lastTrick &&
      gameState.lastTrick.trick.length === 4 &&
      gameState.currentTrick.length === 0;
    const delay = trickJustCompleted ? 2500 : 600;

    const timer = setTimeout(() => {
      setGameState((prev) => {
        if (!prev) return prev;
        const player = prev.currentPlayer;
        if (humanSeats.includes(player)) return prev;

        if (prev.phase === GAME_PHASES.DEAL_CHOICE) {
          return chooseDealOption(prev, DEAL_OPTIONS.TOSTAN);
        }
        if (prev.phase === GAME_PHASES.BIDDING) {
          if (prev.trumpMaker === player && !prev.trumpSuit) {
            return chooseTrump(prev, chooseAITrump(prev, player));
          }
          const bid = makeAIBid(prev, player);
          return bid !== null ? makeBid(prev, player, bid) : passBid(prev, player);
        }
        if (prev.phase === GAME_PHASES.PLAYING) {
          const card = chooseAICard(prev, player);
          return card ? playCard(prev, player, card) : prev;
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
    setRoomCode(null);
    setStatus(null);
    setGameState(loadSavedState() || createInitialState());
  }, [cleanupPeer]);

  const resetGame = useCallback(() => {
    if (!isHost) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setGameState(createInitialState());
  }, [isHost]);

  const createGame = useCallback(() => {
    cleanupPeer();
    setStatus('connecting');
    setConnectedSeats([]);

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

          conn.send({ type: 'welcome', seat });
          conn.send({ type: 'state', gameState: gameStateRef.current });

          conn.on('data', (data) => {
            if (data && data.type === 'action') {
              setGameState((prev) => applyAction(prev, seat, data.action));
            }
          });

          conn.on('close', () => {
            connsRef.current.delete(seat);
            setConnectedSeats(Array.from(connsRef.current.keys()));
          });
        });
      });
    };

    attempt();
  }, [cleanupPeer]);

  const joinGame = useCallback((code) => {
    if (!code) return;
    cleanupPeer();
    setStatus('connecting');

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
      const hostId = CODE_PREFIX + code.trim().toUpperCase();
      const conn = peer.connect(hostId, { reliable: true });
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

  const leaveToMenu = useCallback(() => {
    cleanupPeer();
    setMode('menu');
    setGameState(null);
    setMySeat(0);
    setConnectedSeats([]);
    setRoomCode(null);
    setStatus(null);
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
    status,
    dispatch,
    startSingle,
    createGame,
    joinGame,
    resetGame,
    leaveToMenu
  };
}
