export function MessageBubble({ message, isGroupChat = false, onRetry }) {
  const mine = message.author === 'me';
  const showSenderName = isGroupChat && !mine && Boolean(message.senderName);

  const stateSymbol =
    message.status === 'sending'
      ? '◷'
      : message.status === 'failed'
        ? '!'
        : message.status === 'read'
          ? '✓✓'
          : message.status === 'delivered'
            ? '✓✓'
            : '✓';

  const stateClass =
    message.status === 'read' ? 'is-read' : message.status === 'failed' ? 'is-failed' : 'is-pending';

  return (
    <div className={`wf-message-row ${mine ? 'is-mine' : 'is-other'}`}>
      <div className={`wf-message-bubble ${mine ? 'is-mine' : 'is-other'}`}>
        {showSenderName ? <div className="wf-message-sender">{message.senderName}</div> : null}
        <div className="wf-message-text">{message.text}</div>
        <div className="wf-message-meta">
          <span className="wf-time">{message.timestamp}</span>
          {mine ? <span className={`wf-message-state ${stateClass}`}>{stateSymbol}</span> : null}
        </div>
        {mine && message.status === 'failed' && onRetry ? (
          <button type="button" className="wf-link-danger" onClick={() => onRetry(message.id)}>
            Reintentar
          </button>
        ) : null}
      </div>
    </div>
  );
}
