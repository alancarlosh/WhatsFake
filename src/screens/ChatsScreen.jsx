import { ChatListItem } from '../components/ChatListItem';

export function ChatsScreen({
  chats,
  onlineUsersCount,
  onlineUsers = [],
  selectedChatId,
  onOpenChat,
  onOpenOnlineUser,
  compact = false
}) {
  const connected = chats.filter((chat) => chat.isOnline);
  const others = chats.filter((chat) => !chat.isOnline);
  const nonSelfOnlineUsers = onlineUsers.filter((user) => !user.isSelf);
  const connectedCount =
    nonSelfOnlineUsers.length > 0 ? nonSelfOnlineUsers.length : onlineUsersCount ?? connected.length;

  return (
    <div className={`wf-chats-screen ${compact ? 'is-compact' : ''}`}>
      <div>
        <p className="wf-section-title">Conectados ({connectedCount})</p>
        {nonSelfOnlineUsers.length > 0 ? (
          <p className="wf-section-hint">Toca un usuario para abrir chat.</p>
        ) : null}
        {nonSelfOnlineUsers.length > 0 ? (
          <div className="wf-online-users-card">
            {nonSelfOnlineUsers.map((user) => {
              const label = user.name ?? user.username ?? user.userId ?? 'Usuario conectado';
              const handle = user.username ? `@${user.username}` : user.userId ? `id:${user.userId}` : '';
              return (
                <button
                  key={user.key}
                  type="button"
                  className="wf-online-user-row"
                  onClick={() => onOpenOnlineUser?.(user)}
                >
                  <span className="wf-online-user-name">{label}</span>
                  {handle ? <span className="wf-online-user-handle">{handle}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div>
        {connected.map((chat) => (
          <ChatListItem key={chat.id} chat={chat} active={selectedChatId === chat.id} onPress={onOpenChat} />
        ))}
      </div>

      <div>
        <p className="wf-section-title">Conversaciones</p>
        {others.map((chat) => (
          <ChatListItem key={chat.id} chat={chat} active={selectedChatId === chat.id} onPress={onOpenChat} />
        ))}
        {chats.length === 0 ? <p className="wf-help">Aún no hay conversaciones.</p> : null}
      </div>
    </div>
  );
}
