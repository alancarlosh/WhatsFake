import { useEffect, useMemo, useState } from 'react';

const PRESET_AVATARS = [
  'https://api.dicebear.com/9.x/fun-emoji/png?seed=Nova',
  'https://api.dicebear.com/9.x/fun-emoji/png?seed=Pixel',
  'https://api.dicebear.com/9.x/fun-emoji/png?seed=Vortex',
  'https://api.dicebear.com/9.x/fun-emoji/png?seed=Astra',
  'https://api.dicebear.com/9.x/fun-emoji/png?seed=Flare',
  'https://api.dicebear.com/9.x/fun-emoji/png?seed=Orbit',
  'https://api.dicebear.com/9.x/fun-emoji/png?seed=Zen',
  'https://api.dicebear.com/9.x/fun-emoji/png?seed=Clover'
];

export function SettingsScreen({ username, currentName, currentAvatar, onSaveProfile }) {
  const fallbackAvatar = PRESET_AVATARS[0] ?? '';
  const [nameDraft, setNameDraft] = useState(currentName);
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar ?? fallbackAvatar);
  const [saveMessage, setSaveMessage] = useState(null);

  useEffect(() => {
    setNameDraft(currentName);
  }, [currentName]);

  useEffect(() => {
    setSelectedAvatar(currentAvatar ?? fallbackAvatar);
  }, [currentAvatar, fallbackAvatar]);

  const canSave = useMemo(
    () => nameDraft.trim().length >= 3 && selectedAvatar.length > 0,
    [nameDraft, selectedAvatar]
  );

  const handleSave = () => {
    if (!canSave) {
      return;
    }
    onSaveProfile(nameDraft.trim(), selectedAvatar);
    setSaveMessage('Perfil actualizado en este dispositivo.');
  };

  return (
    <div className="wf-scroll-screen">
      <h1 className="wf-title">Ajustes</h1>
      <p className="wf-subtitle">Edita tu nombre visible y selecciona un avatar predefinido.</p>

      <section className="wf-card">
        <p className="wf-label">Usuario</p>
        <p className="wf-strong">@{username}</p>
      </section>

      <section className="wf-card">
        <p className="wf-label">Nombre visible</p>
        <input
          className="wf-input"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          placeholder="Tu nombre"
        />
        <p className="wf-help">Mínimo 3 caracteres.</p>
      </section>

      <section className="wf-card">
        <p className="wf-label">Avatar</p>
        <div className="wf-avatar-grid">
          {PRESET_AVATARS.map((avatarUrl) => {
            const selected = avatarUrl === selectedAvatar;
            return (
              <button
                key={avatarUrl}
                type="button"
                className={`wf-avatar-option ${selected ? 'is-selected' : ''}`}
                onClick={() => setSelectedAvatar(avatarUrl)}
              >
                <img src={avatarUrl} alt="avatar" className="wf-avatar-image" />
              </button>
            );
          })}
        </div>
      </section>

      <button type="button" className="wf-btn-primary" disabled={!canSave} onClick={handleSave}>
        Guardar cambios
      </button>

      {saveMessage ? <p className="wf-success">{saveMessage}</p> : null}
    </div>
  );
}
