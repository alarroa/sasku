import { useState } from 'react';
import { et } from '../i18n/et';
import { normalizeCode } from '../net/usePeerGame';
import './Lobby.css';

export default function Lobby({ onSingle, onHost, onJoin, status, savedCode = '' }) {
  const [view, setView] = useState('main'); // 'main' | 'host' | 'join'
  const [joinCode, setJoinCode] = useState('');
  const [hostCode, setHostCode] = useState(normalizeCode(savedCode));

  const statusMessage = () => {
    switch (status) {
      case 'connecting': return et.lobby.connecting;
      case 'reconnecting': return et.lobby.reconnecting;
      case 'error': return et.lobby.connectionError;
      case 'notfound': return et.lobby.notFound;
      case 'full': return et.lobby.roomFull;
      case 'disconnected': return et.lobby.disconnected;
      default: return null;
    }
  };

  const message = statusMessage();
  const busy = status === 'connecting' || status === 'reconnecting';

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    const code = normalizeCode(joinCode);
    if (code.length >= 3) onJoin(code);
  };

  const handleHostSubmit = (e) => {
    e.preventDefault();
    // Empty is allowed — the hook generates a random code
    onHost(normalizeCode(hostCode));
  };

  return (
    <div className="lobby">
      <div className="lobby-card">
        <h2 className="lobby-title">{et.meta.title}</h2>

        {view === 'main' && (
          <div className="lobby-buttons">
            <button className="lobby-button primary" onClick={onSingle}>
              {et.lobby.single}
            </button>
            <button className="lobby-button" onClick={() => setView('host')}>
              {et.lobby.host}
            </button>
            <button className="lobby-button" onClick={() => setView('join')}>
              {et.lobby.join}
            </button>
          </div>
        )}

        {view === 'host' && (
          <form className="lobby-join" onSubmit={handleHostSubmit}>
            <label className="lobby-join-label" htmlFor="host-code">
              {et.lobby.chooseCode}
            </label>
            <input
              id="host-code"
              className="lobby-input"
              type="text"
              value={hostCode}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder={et.lobby.codePlaceholder}
              onChange={(e) => setHostCode(normalizeCode(e.target.value))}
            />
            <div className="lobby-buttons">
              <button type="submit" className="lobby-button primary" disabled={busy}>
                {et.lobby.startHost}
              </button>
              <button type="button" className="lobby-button" onClick={() => setView('main')}>
                {et.lobby.back}
              </button>
            </div>
            <p className="lobby-hint">{et.lobby.codeHint}</p>
          </form>
        )}

        {view === 'join' && (
          <form className="lobby-join" onSubmit={handleJoinSubmit}>
            <label className="lobby-join-label" htmlFor="room-code">
              {et.lobby.enterCode}
            </label>
            <input
              id="room-code"
              className="lobby-input"
              type="text"
              value={joinCode}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder={et.lobby.codePlaceholder}
              onChange={(e) => setJoinCode(normalizeCode(e.target.value))}
            />
            <div className="lobby-buttons">
              <button type="submit" className="lobby-button primary" disabled={busy || normalizeCode(joinCode).length < 3}>
                {et.lobby.connect}
              </button>
              <button type="button" className="lobby-button" onClick={() => setView('main')}>
                {et.lobby.back}
              </button>
            </div>
          </form>
        )}

        {message && <p className={`lobby-status ${status}`}>{message}</p>}

        {view === 'main' && <p className="lobby-hint">{et.lobby.hint}</p>}
      </div>
    </div>
  );
}
