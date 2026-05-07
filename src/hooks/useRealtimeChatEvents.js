import { useEffect } from 'react';
import { fetchChats } from '../services/chatApi';
import { loadPendingMessages, removePendingMessage } from '../services/localDb';
import { chatSocket } from '../services/socket';

export function useRealtimeChatEvents({
  session,
  setChats,
  setSelectedChatId,
  setGroupMembersByChat,
  selectedChatIdRef,
  activeTabRef,
  sortChatsByActivity,
  mergePendingMessagesIntoChats,
  syncReadState,
  markPendingAsFailed,
  setTypingForChat,
  syncGroupMembers,
  applyPresencePayload,
  upsertOnlineUserFromPresence,
  replaceOnlineUsersFromSnapshot,
  upsertChatFromRealtimeUpdate,
  resolveUniqueMessageId,
  flushOutbox
}) {
  useEffect(() => {
    if (!session) {
      return;
    }

    const unsubscribeMessage = chatSocket.onMessageReceived((payload) => {
      if (payload.chatId === 'system') {
        return;
      }

      let chatFound = false;
      setChats((prev) =>
        sortChatsByActivity(
          prev.map((chat) => {
            if (chat.id !== payload.chatId) {
              return chat;
            }
            chatFound = true;

            const parsedDate = new Date(payload.sentAt);
            const timestamp = Number.isNaN(parsedDate.getTime())
              ? payload.sentAt
              : parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const statusFromServer = payload.status ?? (payload.author === 'me' ? 'delivered' : undefined);
            const senderName = payload.senderName ?? payload.senderUsername;
            const messages = [...chat.messages];
            const nextUpdatedAt = payload.sentAt;
            const exactIndex = messages.findIndex(
              (message) => message.id === payload.messageId || (payload.clientId ? message.id === payload.clientId : false)
            );

            if (exactIndex >= 0) {
              const existingMessage = messages[exactIndex];
              if (!existingMessage) {
                return chat;
              }

              const isSafeAuthorMatch = existingMessage.author === payload.author;
              const isPendingClientMatch =
                payload.author === 'me' &&
                payload.clientId !== undefined &&
                existingMessage.author === 'me' &&
                existingMessage.id === payload.clientId;

              if (isSafeAuthorMatch || isPendingClientMatch) {
                messages[exactIndex] = {
                  ...existingMessage,
                  status: statusFromServer ?? existingMessage.status,
                  senderName: senderName ?? existingMessage.senderName,
                  timestamp
                };
                return {
                  ...chat,
                  updatedAt: nextUpdatedAt,
                  messages
                };
              }
            }

            if (payload.author === 'me') {
              const pendingIndex = messages.findIndex(
                (message) =>
                  message.author === 'me' &&
                  (payload.clientId ? message.id === payload.clientId : message.text === payload.text) &&
                  (message.status === 'sending' || message.status === 'sent' || message.status === 'failed')
              );

              if (pendingIndex >= 0) {
                const pendingMessage = messages[pendingIndex];
                if (!pendingMessage) {
                  return chat;
                }

                messages[pendingIndex] = {
                  ...pendingMessage,
                  id: payload.messageId
                    ? resolveUniqueMessageId(messages, payload.messageId, 'me', pendingMessage.id)
                    : pendingMessage.id,
                  status: statusFromServer ?? 'delivered',
                  senderName: senderName ?? pendingMessage.senderName,
                  timestamp
                };

                return {
                  ...chat,
                  updatedAt: nextUpdatedAt,
                  messages
                };
              }
            }

            const incomingMessage = {
              id: resolveUniqueMessageId(
                messages,
                payload.messageId,
                payload.author,
                payload.clientId ?? `${payload.chatId}-${payload.messageId}`
              ),
              author: payload.author,
              senderName,
              text: payload.text,
              timestamp,
              status: statusFromServer
            };

            const chatIsOpen = selectedChatIdRef.current === payload.chatId && activeTabRef.current === 'chats';
            const nextUnreadCount = !chatIsOpen && payload.author === 'other' ? chat.unreadCount + 1 : chat.unreadCount;

            return {
              ...chat,
              updatedAt: nextUpdatedAt,
              unreadCount: nextUnreadCount,
              messages: [...messages, incomingMessage]
            };
          })
        )
      );

      if (!chatFound) {
        void fetchChats(session.token)
          .then((serverChats) => mergePendingMessagesIntoChats(serverChats, session.userId))
          .then((nextChats) => {
            setChats((prev) => {
              const prevById = new Map(prev.map((chat) => [chat.id, chat]));
              const merged = nextChats.map((chat) => {
                const existing = prevById.get(chat.id);
                if (!existing) {
                  return chat;
                }
                // El endpoint de lista trae preview (último mensaje), por eso preservamos historial local.
                return {
                  ...existing,
                  ...chat,
                  messages: existing.messages.length > 0 ? existing.messages : chat.messages
                };
              });
              return sortChatsByActivity(merged);
            });
            setSelectedChatId((currentSelected) => {
              if (currentSelected) {
                return currentSelected;
              }
              const incoming = nextChats.find((chat) => chat.id === payload.chatId);
              return incoming?.id ?? nextChats[0]?.id ?? null;
            });
          })
          .catch(() => {});
      }

      const chatIsOpen = selectedChatIdRef.current === payload.chatId && activeTabRef.current === 'chats';
      if (chatIsOpen && payload.author === 'other') {
        syncReadState(payload.chatId);
      }

      if (payload.author === 'other') {
        chatSocket.sendDelivered({
          chatId: payload.chatId,
          messageId: payload.messageId,
          deliveredAt: new Date().toISOString()
        });
      }

      if (payload.author === 'me') {
        if (payload.clientId) {
          void removePendingMessage(payload.clientId);
          return;
        }
        void loadPendingMessages(session.userId).then((pending) => {
          const match = pending.find((item) => item.chatId === payload.chatId && item.text === payload.text);
          if (!match) {
            return;
          }
          void removePendingMessage(match.id);
        });
      }
    });

    const unsubscribeMessageAck = chatSocket.onMessageAck((payload) => {
      if (payload.chatId === 'system') {
        return;
      }
      const ackStatus = payload.status ?? 'delivered';
      setChats((prev) =>
        sortChatsByActivity(
          prev.map((chat) => {
            if (chat.id !== payload.chatId) {
              return chat;
            }
            const targetIndex = chat.messages.findIndex(
              (message) => message.id === payload.clientId || (payload.messageId ? message.id === payload.messageId : false)
            );
            if (targetIndex < 0) {
              return chat;
            }
            const nextMessages = [...chat.messages];
            const current = nextMessages[targetIndex];
            if (!current) {
              return chat;
            }
            nextMessages[targetIndex] = {
              ...current,
              id: payload.messageId ?? current.id,
              status: ackStatus
            };
            return {
              ...chat,
              messages: nextMessages
            };
          })
        )
      );

      if (ackStatus === 'failed') {
        void markPendingAsFailed(session.userId, payload.clientId, payload.error);
      } else {
        void removePendingMessage(payload.clientId);
      }
    });

    const unsubscribeMessageStatus = chatSocket.onMessageStatusUpdated((payload) => {
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== payload.chatId) {
            return chat;
          }
          return {
            ...chat,
            updatedAt: payload.updatedAt ?? chat.updatedAt,
            messages: chat.messages.map((message) =>
              message.id === payload.messageId ? { ...message, status: payload.status } : message
            )
          };
        })
      );
    });

    const unsubscribeChatUpdated = chatSocket.onChatUpdated((payload) => {
      const chat = payload.chat;
      const chatId = chat.id ?? chat.chatId;
      if (!chatId) {
        return;
      }
      const name = chat.contactName ?? chat.groupName ?? chat.name ?? chat.title ?? 'Chat';
      const handleSeed = chat.contactHandle ?? chat.username ?? name.toLowerCase().replace(/\s+/g, '');
      const lastMessage = chat.lastMessage ?? chat.latestMessage ?? chat.last_message;
      const message = lastMessage
        ? {
            id: lastMessage.id ?? `${chatId}-last`,
            author: lastMessage.author === 'other' ? 'other' : 'me',
            text: lastMessage.text ?? '',
            timestamp: lastMessage.sentAt
              ? new Date(lastMessage.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '',
            status: lastMessage.status
          }
        : undefined;

      upsertChatFromRealtimeUpdate({
        id: chatId,
        contactName: name,
        contactHandle: handleSeed.startsWith('@') ? handleSeed : `@${handleSeed}`,
        avatar: chat.avatar ?? name.slice(0, 2).toUpperCase(),
        unreadCount: chat.unreadCount ?? chat.unread ?? 0,
        updatedAt: chat.updatedAt,
        myRole: chat.myRole ?? chat.role,
        isGroup: chat.kind === 'group',
        lastMessage: message
      });
    });

    const unsubscribeRead = chatSocket.onRead((payload) => {
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== payload.chatId) {
            return chat;
          }
          return {
            ...chat,
            messages: chat.messages.map((message) => {
              if (message.author !== 'me') {
                return message;
              }
              if (payload.messageId && message.id !== payload.messageId) {
                return message;
              }
              return { ...message, status: 'read' };
            })
          };
        })
      );
    });

    const unsubscribeTyping = chatSocket.onTyping((payload) => {
      if (payload.userId === session.userId) {
        return;
      }
      setTypingForChat(payload.chatId, payload.isTyping);
    });

    const unsubscribeGroupRole = chatSocket.onGroupRoleUpdated((payload) => {
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== payload.groupId) {
            return chat;
          }
          if (payload.userId !== session.userId) {
            return chat;
          }
          return { ...chat, myRole: payload.role };
        })
      );

      setGroupMembersByChat((prev) => {
        const current = prev[payload.groupId];
        if (!current) {
          return prev;
        }
        return {
          ...prev,
          [payload.groupId]: current.map((member) =>
            member.userId === payload.userId ? { ...member, role: payload.role } : member
          )
        };
      });
    });

    const unsubscribeGroupMembers = chatSocket.onGroupMembersUpdated((payload) => {
      const normalized = payload.members.map((member) => ({
        ...member,
        isSelf: member.userId === session.userId
      }));
      syncGroupMembers(payload.groupId, normalized);
    });

    const unsubscribePresence = chatSocket.onPresenceUpdate((payload) => {
      applyPresencePayload(payload);
      upsertOnlineUserFromPresence(payload);
    });

    const unsubscribePresenceSnapshot = chatSocket.onPresenceSnapshot((snapshot) => {
      snapshot.forEach((item) => applyPresencePayload(item));
      replaceOnlineUsersFromSnapshot(snapshot);
    });

    const unsubscribeConnected = chatSocket.onConnected(() => {
      void flushOutbox(session.userId);
    });

    const unsubscribeError = chatSocket.onError(() => {});

    void chatSocket
      .connect(session.token)
      .then(() => flushOutbox(session.userId))
      .catch(() => {});

    return () => {
      unsubscribeMessage();
      unsubscribeMessageAck();
      unsubscribeMessageStatus();
      unsubscribeChatUpdated();
      unsubscribeRead();
      unsubscribeTyping();
      unsubscribeGroupRole();
      unsubscribeGroupMembers();
      unsubscribePresence();
      unsubscribePresenceSnapshot();
      unsubscribeConnected();
      unsubscribeError();
      chatSocket.disconnect();
    };
  }, [
    session,
    setChats,
    setSelectedChatId,
    setGroupMembersByChat,
    selectedChatIdRef,
    activeTabRef,
    sortChatsByActivity,
    mergePendingMessagesIntoChats,
    syncReadState,
    markPendingAsFailed,
    setTypingForChat,
    syncGroupMembers,
    applyPresencePayload,
    upsertOnlineUserFromPresence,
    replaceOnlineUsersFromSnapshot,
    upsertChatFromRealtimeUpdate,
    resolveUniqueMessageId,
    flushOutbox
  ]);
}
