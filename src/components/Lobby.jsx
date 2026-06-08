import { useState } from 'react';
import { et } from '../i18n/et';
import './Lobby.css';

export default function Lobby({ onSingle, onHost, onJoin, status }) {
  const [view, setView] = useState('main'); // 'main' | 'join'
  const [code, setCode] = useState('');

  const statusMessage = () => {
    switch (status) {
      case 'connecting': return et.lobby.connecting;
      case 'error': return et.lobby.connectionError;
      case 'notfound': return et.lobby.notFound;
      case 'full': return et.lobby.roomFull;
      case 'disconnected': return et.lobby.disconnected;
      default: return null;
    }
  };

  const message = statusMessage();
  const isConnecting = status === 'connecting';

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    if (code.trim()) onJoin(code.trim().toUpperCase());
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
            <button className="lobby-button" onClick={onHost} disabled={isConnecting}>
              {et.lobby.host}
            </button>
            <button className="lobby-button" onClick={() => setView('join')}>
              {et.lobby.join}
            </button>
          </div>
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
              value={code}
              maxLength={4}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="ABCD"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <div className="lobby-buttons">
              <button type="submit" className="lobby-button primary" disabled={isConnecting || !code.trim()}>
                {et.lobby.connect}
              </button>
              <button type="button" className="lobby-button" onClick={() => setView('main')}>
                {et.lobby.back}
              </button>
            </div>
          </form>
        )}

        {message && <p className={`lobby-status ${status}`}>{message}</p>}

        <p className="lobby-hint">{et.lobby.hint}</p>
      </div>
    </div>
  );
}
