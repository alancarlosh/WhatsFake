export function ChatListItem({ chat, active = false, onPress }) {
  const last = chat.messages.at(-1);
  const avatarIsUrl = /^https?:\/\//i.test(chat.avatar);

  return (
    <button
      type="button"
      className={`wf-chat-item ${active ? 'is-active' : ''}`}
      onClick={() => onPress(chat.id)}
    >
      <div className="wf-avatar-wrap">
        <div className="wf-avatar">
          {avatarIsUrl ? (
            <img src={chat.avatar} alt={chat.contactName} className="wf-avatar-image" />
          ) : (
            <span>{chat.avatar}</span>
          )}
        </div>
        {chat.isOnline ? <span className="wf-online-dot" /> : null}
      </div>

      <div className="wf-chat-item-content">
        <div className="wf-chat-item-top">
          <div className="wf-chat-item-name-wrap">
            <span className="wf-chat-item-name">{chat.contactName}</span>
            {chat.isGroup ? <span className="wf-chip">Grupo</span> : null}
            {chat.isGroup && chat.myRole ? <span className="wf-chip-muted">{chat.myRole}</span> : null}
          </div>
          <span className="wf-time">{last?.timestamp ?? ''}</span>
        </div>

        <div className="wf-chat-item-bottom">
          <span className="wf-preview">
            {last?.author === 'me' ? 'Tú: ' : ''}
            {last?.text ?? 'Aún sin mensajes'}
          </span>
          {chat.unreadCount > 0 ? <span className="wf-badge">{chat.unreadCount}</span> : null}
        </div>
      </div>
    </button>
  );
}
