import { useMemo } from 'react';

export function useChatDerivedState({ chats, selectedChatId, typingByChat }) {
  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId]
  );

  const typingStatusText = useMemo(
    () => (selectedChatId && typingByChat[selectedChatId] ? 'Escribiendo...' : null),
    [selectedChatId, typingByChat]
  );

  return {
    selectedChat,
    typingStatusText
  };
}
