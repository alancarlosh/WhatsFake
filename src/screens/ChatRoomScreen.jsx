import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageBubble } from '../components/MessageBubble';

export function ChatRoomScreen({
  chat,
  onBack,
  onSend,
  onRetryMessage,
  onTyping,
  typingStatusText = null,
  onOpenGroupDetails,
  canSendMessages = true,
  showBackButton = true,
  embedded = false
}) {
  const [draft, setDraft] = useState('');
  const isTypingRef = useRef(false);

  const headerStatus = useMemo(() => {
    if (typingStatusText) {
      return typingStatusText;
    }
    return chat.isOnline ? 'En línea ahora' : 'Activo recientemente';
  }, [chat.isOnline, typingStatusText]);

  useEffect(() => {
    const nextTyping = draft.trim().length > 0;
    if (nextTyping === isTypingRef.current) {
      return;
    }
    isTypingRef.current = nextTyping;
    onTyping?.(chat.id, nextTyping);
  }, [chat.id, draft, onTyping]);

  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        onTyping?.(chat.id, false);
      }
    };
  }, [chat.id, onTyping]);

  const handleSend = () => {
    if (!canSendMessages) {
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTyping?.(chat.id, false);
    }

    onSend(chat.id, trimmed);
    setDraft('');
  };

  return (
    <div className={`wf-chat-room ${embedded ? 'is-embedded' : ''}`}>
      <div className="wf-chat-header">
        {showBackButton ? (
          <button type="button" className="wf-link" onClick={onBack}>
            Atrás
          </button>
        ) : null}

        <div className="wf-chat-header-main">
          <div className="wf-chat-header-title-row">
            <h2 className="wf-chat-header-title">{chat.contactName}</h2>
            {chat.isGroup && chat.myRole ? <span className="wf-chip">{chat.myRole.toUpperCase()}</span> : null}
          </div>
          <p className="wf-chat-header-status">{headerStatus}</p>
        </div>

        {chat.isGroup ? (
          <button type="button" className="wf-link" onClick={onOpenGroupDetails}>
            Detalles
          </button>
        ) : null}
      </div>

      <div className="wf-messages-list">
        {chat.messages.map((item) => (
          <MessageBubble
            key={item.id}
            message={item}
            isGroupChat={Boolean(chat.isGroup)}
            onRetry={item.status === 'failed' ? (messageId) => onRetryMessage?.(chat.id, messageId) : undefined}
          />
        ))}
      </div>

      <div className="wf-chat-input-bar">
        <input
          className="wf-input wf-chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={canSendMessages ? 'Escribe un mensaje' : 'Solo lectura'}
          disabled={!canSendMessages}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleSend();
            }
          }}
        />
        <button type="button" className="wf-btn-primary" onClick={handleSend} disabled={!canSendMessages}>
          {canSendMessages ? 'Enviar' : 'Bloqueado'}
        </button>
      </div>
    </div>
  );
}
