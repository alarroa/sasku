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

const STORAGE_KEY = 'sasku-game-state';      // single-player save
const HOST_STATE_KEY = 'sasku-host-state';    // host's networked game (survives refresh)
const SESSION_KEY = 'sasku-mp-session';       // {role, code, name} — drives auto-resume
const CLIENT_ID_KEY = 'sasku-client-id';      // stable per-device identity
const ROOM_CODE_KEY = 'sasku-room-code';      // last room code (remembered / prefilled)
const HOST_SEATS_KEY = 'sasku-host-seats';    // {clientId: seat} — restores seats after host refresh

// Prefix to namespace our peer ids on the public PeerJS broker
const CODE_PREFIX = 'sasku-';

// Seat assignment order for joining players:
// seat 0 = host, seat 2 = host's partner (first to join),
// seats 1 & 3 = opponents (join afterwards). Empty seats are AI.
const SEAT_ORDER = [2, 1, 3];

// How long a seat is held for a disconnected human before an AI takes over.
const DISCONNECT_GRACE_MS = 45000;

// Modes: 'single' | 'host' | 'client'. The app boots in 'single' (or resumes a
// saved network session). In 'single'/'host' this peer owns the game state.

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } }
function safeRemove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

// Codes are normalised to A–Z/0–9. A user may set their own; the default is a
// 4-digit numeric code (so phones show the number keypad).
export function normalizeCode(raw) {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function makeRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += Math.floor(Math.random() * 10);
  return code;
}

function readSession() {
  try { return JSON.parse(safeGet(SESSION_KEY) || 'null'); } catch { return null; }
}

function getClientId() {
  let id = safeGet(CLIENT_ID_KEY);
  if (!id) {
    id = 'c-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    safeSet(CLIENT_ID_KEY, id);
  }
  return id;
}

function loadSeatMap() {
  try { return JSON.parse(safeGet(HOST_SEATS_KEY) || '{}'); } catch { return {}; }
}
function saveSeatMap(map) { safeSet(HOST_SEATS_KEY, JSON.stringify(map)); }
function setSeatInMap(clientId, seat) { saveSeatMap({ ...loadSeatMap(), [clientId]: seat }); }
function removeSeatFromMap(clientId) {
  const next = { ...loadSeatMap() };
  delete next[clientId];
  saveSeatMap(next);
}

function loadSavedState(key) {
  try {
    const saved = safeGet(key);
    if (saved) {
      const s = JSON.parse(saved);
      if (!s.matchWins) s.matchWins = [0, 0];
      if (s.pokkBonus === undefined) s.pokkBonus = false;
      if (!s.hasExchangedPicture) s.hasExchangedPicture = [false, false, false, false];
      if (s.pendingPictureExchange === undefined) s.pendingPictureExchange = null;
      return s;
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
      if (state.phase !== GAME_PHASES.BIDDING) return state;
      if (state.pendingPictureExchange) return state;
      if (!canExchangePicture(state, seat)) return state;
      const pictureCard = state.hands[seat].find(c => c.isPicture);
      if (!pictureCard) return state;
      return { ...state, pendingPictureExchange: { fromPlayer: seat, pictureCard } };
    }

    case 'exchangeGiveBack': {
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
  // Boot into single-player, unless a saved network session should be resumed.
  const [mode, setMode] = useState(() => { const s = readSession(); return s && s.role ? s.role : 'single'; });
  const [gameState, setGameState] = useState(() => (readSession() ? null : (loadSavedState(STORAGE_KEY) || createInitialState())));
  const [mySeat, setMySeat] = useState(0);
  const [roomCode, setRoomCode] = useState(null);
  const [connectedSeats, setConnectedSeats] = useState([]); // seats with a live connection
  const [heldSeats, setHeldSeats] = useState([]);           // seats held during disconnect grace
  const [playerNames, setPlayerNames] = useState([null, null, null, null]);
  const [status, setStatus] = useState(() => (readSession() ? 'connecting' : null));
  const [savedCode, setSavedCode] = useState(safeGet(ROOM_CODE_KEY) || '');

  const peerRef = useRef(null);
  const seatsRef = useRef(new Map()); // host: seat -> { conn: DataConnection|null, clientId }
  const graceRef = useRef(new Map()); // host: seat -> grace timeout id
  const hostConnRef = useRef(null);   // client: connection to host
  const gameStateRef = useRef(null);
  const modeRef = useRef(mode);
  const manualLeaveRef = useRef(false);
  const clientReconnectRef = useRef(null);

  const isHost = mode === 'single' || mode === 'host';

  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const syncSeatStates = useCallback(() => {
    const connected = [];
    const held = [];
    seatsRef.current.forEach((meta, seat) => {
      if (meta.conn) connected.push(seat);
      else held.push(seat);
    });
    setConnectedSeats(connected);
    setHeldSeats(held);
  }, []);

  // Persist single-player OR host networked game so a refresh can resume it
  useEffect(() => {
    if (!gameState) return;
    if (mode === 'single') safeSet(STORAGE_KEY, JSON.stringify(gameState));
    else if (mode === 'host') safeSet(HOST_STATE_KEY, JSON.stringify(gameState));
  }, [gameState, mode]);

  // Host: broadcast authoritative state to all live clients on every change
  useEffect(() => {
    if (mode !== 'host' || !gameState) return;
    seatsRef.current.forEach((meta) => {
      if (meta.conn && meta.conn.open) meta.conn.send({ type: 'state', gameState });
    });
  }, [gameState, mode]);

  // Host: keep every client's view of the seat names in sync
  useEffect(() => {
    if (mode !== 'host') return;
    seatsRef.current.forEach((meta) => {
      if (meta.conn && meta.conn.open) meta.conn.send({ type: 'names', names: playerNames });
    });
  }, [playerNames, mode]);

  // Host: drive AI for any seat not occupied by a human (connected or held)
  useEffect(() => {
    if (!isHost || !gameState) return;

    const humanSeats = mode === 'host' ? [0, ...connectedSeats, ...heldSeats] : [0];

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
    if (humanSeats.includes(cp)) return; // wait for a human (possibly reconnecting)

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
          const rand = Math.random();
          if (rand < 0.15) return chooseDealOption(prev, DEAL_OPTIONS.PIME_RUUTU);
          if (rand < 0.25) return chooseDealOption(prev, DEAL_OPTIONS.VALIDA);
          return chooseDealOption(prev, DEAL_OPTIONS.TOSTAN);
        }
        if (prev.phase === GAME_PHASES.PACK_CHOICE) {
          const available = prev.cardPacks
            .map((pack, i) => (pack.takenBy === null ? i : -1))
            .filter(i => i !== -1);
          const packIndex = available[Math.floor(Math.random() * available.length)];
          return chooseCardPack(prev, player, packIndex);
        }
        if (prev.phase === GAME_PHASES.BIDDING) {
          if (prev.hasPassed[player]) return passBid(prev, player);
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
          const fallback = prev.hands[player].find(c => canPlayCard(prev, player, c));
          return fallback ? playCard(prev, player, fallback) : prev;
        }
        return prev;
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [gameState, isHost, mode, connectedSeats, heldSeats]);

  // Host: auto-pass a human seat that already passed during bidding
  useEffect(() => {
    if (!isHost || !gameState) return;
    if (gameState.phase !== GAME_PHASES.BIDDING || gameState.pendingPictureExchange) return;

    const humanSeats = mode === 'host' ? [0, ...connectedSeats, ...heldSeats] : [0];
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
  }, [gameState, isHost, mode, connectedSeats, heldSeats]);

  const clearName = useCallback((seat) => {
    setPlayerNames((prev) => {
      if (!prev[seat]) return prev;
      const next = [...prev];
      next[seat] = null;
      return next;
    });
  }, []);

  const clearGraceTimers = useCallback(() => {
    graceRef.current.forEach((t) => clearTimeout(t));
    graceRef.current.clear();
  }, []);

  const cleanupPeer = useCallback(() => {
    if (clientReconnectRef.current) { clearTimeout(clientReconnectRef.current); clientReconnectRef.current = null; }
    clearGraceTimers();
    seatsRef.current.forEach((meta) => {
      if (meta.conn) { try { meta.conn.close(); } catch { /* ignore */ } }
    });
    seatsRef.current.clear();
    if (hostConnRef.current) {
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
  }, [clearGraceTimers]);

  const dispatch = useCallback((action) => {
    if (isHost) {
      setGameState((prev) => applyAction(prev, 0, action)); // host's local human = seat 0
    } else if (hostConnRef.current && hostConnRef.current.open) {
      hostConnRef.current.send({ type: 'action', action });
    }
  }, [isHost]);

  // ---- Host ----------------------------------------------------------------

  const assignSeat = useCallback((clientId) => {
    for (const [seat, meta] of seatsRef.current) {
      if (meta.clientId === clientId) return seat; // returning player keeps their seat
    }
    const map = loadSeatMap();
    if (map[clientId] !== undefined && !seatsRef.current.has(map[clientId])) {
      return map[clientId]; // reclaim a persisted seat after a host refresh
    }
    const used = new Set([...seatsRef.current.keys(), ...Object.values(map)]);
    const seat = SEAT_ORDER.find((s) => !used.has(s));
    if (seat !== undefined) setSeatInMap(clientId, seat);
    return seat;
  }, []);

  const freeSeat = useCallback((seat, clientId) => {
    const t = graceRef.current.get(seat);
    if (t) clearTimeout(t);
    graceRef.current.delete(seat);
    seatsRef.current.delete(seat);
    removeSeatFromMap(clientId);
    clearName(seat);
    syncSeatStates();
  }, [clearName, syncSeatStates]);

  const holdSeat = useCallback((seat, clientId, conn) => {
    const meta = seatsRef.current.get(seat);
    if (!meta || (conn && meta.conn !== conn)) return; // superseded by a newer connection
    seatsRef.current.set(seat, { conn: null, clientId }); // keep the name during grace
    syncSeatStates();
    if (graceRef.current.has(seat)) clearTimeout(graceRef.current.get(seat));
    graceRef.current.set(seat, setTimeout(() => freeSeat(seat, clientId), DISCONNECT_GRACE_MS));
  }, [freeSeat, syncSeatStates]);

  const handleHostConnection = useCallback((conn) => {
    conn.on('open', () => {
      const clientId = (conn.metadata && conn.metadata.clientId) || ('anon-' + conn.peer);
      const rawName = conn.metadata && typeof conn.metadata.name === 'string'
        ? conn.metadata.name.trim().slice(0, 12) : '';
      const seat = assignSeat(clientId);

      if (seat === undefined) {
        conn.send({ type: 'full' });
        setTimeout(() => { try { conn.close(); } catch { /* ignore */ } }, 200);
        return;
      }

      if (graceRef.current.has(seat)) { clearTimeout(graceRef.current.get(seat)); graceRef.current.delete(seat); }
      const existing = seatsRef.current.get(seat);
      if (existing && existing.conn && existing.conn !== conn) {
        try { existing.conn.close(); } catch { /* ignore */ }
      }

      seatsRef.current.set(seat, { conn, clientId });
      syncSeatStates();
      setPlayerNames((prev) => {
        const next = [...prev];
        next[seat] = rawName || null;
        return next;
      });

      conn.send({ type: 'welcome', seat });
      conn.send({ type: 'state', gameState: gameStateRef.current });

      conn.on('data', (data) => {
        if (data && data.type === 'action') {
          setGameState((prev) => applyAction(prev, seat, data.action));
        } else if (data && data.type === 'leave') {
          // Explicit leave — hand the seat to the AI immediately (no grace)
          try { conn.close(); } catch { /* ignore */ }
          freeSeat(seat, clientId);
        }
      });

      // Disconnects (close/error/dropped ICE) hold the seat for a grace window so
      // a refresh or app-switch can reclaim it before an AI takes over.
      const onDrop = () => holdSeat(seat, clientId, conn);
      conn.on('close', onDrop);
      conn.on('error', onDrop);
      conn.on('iceStateChanged', (state) => {
        if (state === 'disconnected' || state === 'failed' || state === 'closed') onDrop();
      });
    });
  }, [assignSeat, freeSeat, holdSeat, syncSeatStates]);

  const createGame = useCallback((name, requestedCode, opts) => {
    const resume = !!(opts && opts.resume);
    cleanupPeer();
    manualLeaveRef.current = false;
    setStatus('connecting');
    setConnectedSeats([]);
    setHeldSeats([]);
    const hostName = typeof name === 'string' ? name.trim().slice(0, 12) : '';
    setPlayerNames([hostName || null, null, null, null]);

    const normalized = normalizeCode(requestedCode);
    const fixedCode = normalized || (resume ? normalizeCode(savedCode) : '');
    let attempts = 0;

    const attempt = (code) => {
      const peer = new Peer(CODE_PREFIX + code);
      peerRef.current = peer;

      peer.on('open', () => {
        setRoomCode(code);
        setMySeat(0);
        setMode('host');
        setStatus('ready');
        setSavedCode(code);
        safeSet(ROOM_CODE_KEY, code);
        safeSet(SESSION_KEY, JSON.stringify({ role: 'host', code, name: hostName }));

        if (resume) {
          setGameState(loadSavedState(HOST_STATE_KEY) || createInitialState());
          // Give previously-seated players a grace window to reconnect
          const map = loadSeatMap();
          Object.entries(map).forEach(([clientId, seat]) => {
            if (seatsRef.current.has(seat)) return;
            seatsRef.current.set(seat, { conn: null, clientId });
            graceRef.current.set(seat, setTimeout(() => freeSeat(seat, clientId), DISCONNECT_GRACE_MS));
          });
          syncSeatStates();
        } else {
          saveSeatMap({});
          setGameState(createInitialState());
        }
      });

      peer.on('error', (err) => {
        if (err && err.type === 'unavailable-id') {
          attempts += 1;
          try { peer.destroy(); } catch { /* ignore */ }
          if (fixedCode && attempts <= 5) {
            clientReconnectRef.current = setTimeout(() => attempt(fixedCode), 1500);
          } else {
            attempt(makeRoomCode());
          }
          return;
        }
        console.error('Peer error:', err);
        setStatus('error');
      });

      peer.on('disconnected', () => {
        if (!manualLeaveRef.current && peerRef.current === peer && !peer.destroyed) {
          try { peer.reconnect(); } catch { /* ignore */ }
        }
      });

      peer.on('connection', handleHostConnection);
    };

    attempt(fixedCode || makeRoomCode());
  }, [cleanupPeer, handleHostConnection, freeSeat, syncSeatStates, savedCode]);

  // ---- Client --------------------------------------------------------------

  const joinGame = useCallback((requestedCode, name) => {
    const code = normalizeCode(requestedCode) || normalizeCode(savedCode);
    if (!code) return;

    cleanupPeer();
    manualLeaveRef.current = false;
    setPlayerNames([null, null, null, null]);
    const myName = typeof name === 'string' ? name.trim().slice(0, 12) : '';
    const clientId = getClientId();

    const openConnection = (isRetry) => {
      setStatus(isRetry ? 'reconnecting' : 'connecting');
      const peer = new Peer();
      peerRef.current = peer;

      const scheduleRetry = () => {
        if (manualLeaveRef.current) return;
        if (clientReconnectRef.current) clearTimeout(clientReconnectRef.current);
        setStatus('reconnecting');
        clientReconnectRef.current = setTimeout(() => {
          if (manualLeaveRef.current) return;
          try { peer.destroy(); } catch { /* ignore */ }
          openConnection(true);
        }, 2500);
      };

      peer.on('open', () => {
        const conn = peer.connect(CODE_PREFIX + code, { reliable: true, metadata: { name: myName, clientId } });
        hostConnRef.current = conn;

        conn.on('open', () => setStatus('connected'));

        conn.on('data', (data) => {
          if (!data) return;
          if (data.type === 'welcome') {
            setMySeat(data.seat);
            setRoomCode(code);
            setMode('client');
            setStatus('connected');
            setSavedCode(code);
            safeSet(ROOM_CODE_KEY, code);
            safeSet(SESSION_KEY, JSON.stringify({ role: 'client', code, name: myName }));
          } else if (data.type === 'state') {
            setGameState(data.gameState);
          } else if (data.type === 'names') {
            setPlayerNames(data.names);
          } else if (data.type === 'full') {
            setStatus('full');
            manualLeaveRef.current = true; // don't hammer a full room
          }
        });

        conn.on('close', scheduleRetry);
        conn.on('error', (err) => { console.error('Connection error:', err); scheduleRetry(); });
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err && err.type === 'peer-unavailable') {
          setStatus(modeRef.current === 'client' ? 'reconnecting' : 'notfound');
        }
        scheduleRetry();
      });

      peer.on('disconnected', () => {
        if (!manualLeaveRef.current && peerRef.current === peer && !peer.destroyed) {
          try { peer.reconnect(); } catch { /* ignore */ }
        }
      });
    };

    openConnection(false);
  }, [cleanupPeer, savedCode]);

  // ---- Menu / lifecycle ----------------------------------------------------

  const startSingle = useCallback(() => {
    manualLeaveRef.current = true;
    cleanupPeer();
    safeRemove(SESSION_KEY);
    safeRemove(HOST_STATE_KEY);
    saveSeatMap({});
    setMode('single');
    setMySeat(0);
    setConnectedSeats([]);
    setHeldSeats([]);
    setPlayerNames([null, null, null, null]);
    setRoomCode(null);
    setStatus(null);
    setGameState(loadSavedState(STORAGE_KEY) || createInitialState());
  }, [cleanupPeer]);

  const resetGame = useCallback(() => {
    if (!isHost) return;
    if (mode === 'single') safeRemove(STORAGE_KEY);
    else safeRemove(HOST_STATE_KEY);
    setGameState(createInitialState());
  }, [isHost, mode]);

  // Auto-resume a networked session after a refresh / app restart.
  useEffect(() => {
    if (peerRef.current) return;
    const session = readSession();
    if (!session || !session.code) return;
    const t = setTimeout(() => {
      if (peerRef.current) return;
      if (session.role === 'host') createGame(session.name, session.code, { resume: true });
      else if (session.role === 'client') joinGame(session.code, session.name);
    }, 0);
    return () => clearTimeout(t);
  }, [createGame, joinGame]);

  // Returning to the tab: nudge a reconnect if the connection dropped.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || manualLeaveRef.current) return;
      const peer = peerRef.current;
      if (peer && peer.disconnected && !peer.destroyed) {
        try { peer.reconnect(); } catch { /* ignore */ }
      }
      if (modeRef.current === 'client' &&
          (!hostConnRef.current || !hostConnRef.current.open) &&
          !clientReconnectRef.current) {
        const code = normalizeCode(savedCode);
        const session = readSession();
        if (code) joinGame(code, session ? session.name : '');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [joinGame, savedCode]);

  // Clean up on unmount
  useEffect(() => cleanupPeer, [cleanupPeer]);

  return {
    mode,
    isHost,
    gameState,
    mySeat,
    roomCode,
    connectedSeats,
    heldSeats,
    playerNames,
    status,
    savedCode,
    dispatch,
    startSingle,
    createGame,
    joinGame,
    resetGame
  };
}
