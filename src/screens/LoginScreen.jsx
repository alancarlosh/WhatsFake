import { useMemo, useState } from 'react';

export function LoginScreen({ onSubmit, loading = false, errorMessage = null }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const canContinue = useMemo(
    () => username.trim().length >= 3 && password.length >= 4,
    [username, password]
  );

  const handleContinue = async () => {
    if (!canContinue || loading) {
      return;
    }
    await onSubmit(username.trim(), password);
  };

  return (
    <div className="wf-login-wrap">
      <div className="wf-login-card">
        <p className="wf-eyebrow">WHATSFAKE</p>
        <h1 className="wf-title">Inicia sesión</h1>
        <p className="wf-subtitle">Usa un username simple para entrar al prototipo.</p>

        <input
          className="wf-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Ej. alan_dev"
          autoComplete="username"
        />

        <input
          className="wf-input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Contraseña"
          type="password"
          autoComplete="current-password"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleContinue();
            }
          }}
        />

        <button
          type="button"
          className="wf-btn-primary"
          onClick={() => void handleContinue()}
          disabled={!canContinue || loading}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        {errorMessage ? <p className="wf-error">{errorMessage}</p> : null}
        <p className="wf-help">Username mínimo 3 caracteres y contraseña mínimo 4.</p>
      </div>
    </div>
  );
}
