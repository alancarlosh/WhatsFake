export function ContactItem({ id, name, handle, avatar, selected = false, actionLabel = 'Nuevo', onPress }) {
  const avatarIsUrl = /^https?:\/\//i.test(avatar);

  return (
    <button
      type="button"
      className={`wf-contact-item ${selected ? 'is-selected' : ''}`}
      onClick={() => onPress(id)}
    >
      <div className="wf-avatar wf-contact-avatar">
        {avatarIsUrl ? (
          <img src={avatar} alt={name} className="wf-avatar-image" />
        ) : (
          <span>{avatar}</span>
        )}
      </div>

      <div className="wf-contact-content">
        <span className="wf-contact-name">{name}</span>
        <span className="wf-contact-handle">{handle}</span>
      </div>

      <span className={`wf-contact-cta ${selected ? 'is-selected' : ''}`}>{actionLabel}</span>
    </button>
  );
}
