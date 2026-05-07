import { useCallback, useRef } from 'react';
import { loadPendingMessages, upsertPendingMessage } from '../services/localDb';
import { chatSocket } from '../services/socket';

export function useMessageComposer({ session, chats, setChats, onContactDiscovered }) {
  const outboxFlushInProgressRef = useRef(false);

  const setMessageStatus = useCallback((chatId, messageId, status) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) {
          return chat;
        }
        return {
          ...chat,
          messages: chat.messages.map((message) =>
            message.id === messageId ? { ...message, status } : message
          )
        };
      })
    );
  }, [setChats]);

  const sendPendingMessage = useCallback(async (payload) => {
    try {
      if (!chatSocket.isConnected) {
        throw new Error('Sin conexión al socket.');
      }

      chatSocket.sendMessage({
        chatId: payload.chatId,
        clientId: payload.clientId,
        text: payload.text,
        sentAt: payload.sentAt
      });

      setMessageStatus(payload.chatId, payload.clientId, 'sent');
      await upsertPendingMessage({
        id: payload.clientId,
        userId: payload.userId,
        chatId: payload.chatId,
        text: payload.text,
        sentAt: payload.sentAt,
        status: 'pending',
        attempts: payload.attempts + 1
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'No se pudo enviar el mensaje.';
      setMessageStatus(payload.chatId, payload.clientId, 'failed');
      await upsertPendingMessage({
        id: payload.clientId,
        userId: payload.userId,
        chatId: payload.chatId,
        text: payload.text,
        sentAt: payload.sentAt,
        status: 'failed',
        attempts: payload.attempts + 1,
        lastError: reason
      });
    }
  }, [setMessageStatus]);

  const markPendingAsFailed = useCallback(async (userId, clientId, reason) => {
    const pending = await loadPendingMessages(userId);
    const existing = pending.find((item) => item.id === clientId);
    if (!existing) {
      return;
    }
    await upsertPendingMessage({
      ...existing,
      status: 'failed',
      lastError: reason ?? existing.lastError
    });
  }, []);

  const flushOutbox = useCallback(async (userId) => {
    if (outboxFlushInProgressRef.current || !chatSocket.isConnected) {
      return;
    }

    outboxFlushInProgressRef.current = true;
    try {
      const pending = await loadPendingMessages(userId);
      for (const item of pending) {
        setMessageStatus(item.chatId, item.id, 'sending');
        await sendPendingMessage({
          userId,
          chatId: item.chatId,
          clientId: item.id,
          text: item.text,
          sentAt: item.sentAt,
          attempts: item.attempts
        });
      }
    } finally {
      outboxFlushInProgressRef.current = false;
    }
  }, [sendPendingMessage, setMessageStatus]);

  const sendMessage = useCallback((chatId, text) => {
    if (!session) {
      return;
    }

    const chatTarget = chats.find((chat) => chat.id === chatId);
    if (chatTarget?.isGroup && chatTarget.myRole === 'readonly') {
      return;
    }

    if (chatTarget) {
      onContactDiscovered?.(chatTarget);
    }

    const sentAt = new Date();
    const timestamp = sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const clientId = `${chatId}-${Date.now()}`;

    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) {
          return chat;
        }
        const newMessage = {
          id: clientId,
          author: 'me',
          text,
          timestamp,
          status: 'sending'
        };
        return {
          ...chat,
          messages: [...chat.messages, newMessage]
        };
      })
    );

    void upsertPendingMessage({
      id: clientId,
      userId: session.userId,
      chatId,
      text,
      sentAt: sentAt.toISOString(),
      status: 'pending',
      attempts: 0
    }).then(() =>
      sendPendingMessage({
        userId: session.userId,
        chatId,
        clientId,
        text,
        sentAt: sentAt.toISOString(),
        attempts: 0
      })
    );
  }, [session, chats, setChats, onContactDiscovered, sendPendingMessage]);

  const retryMessage = useCallback(async (chatId, messageId) => {
    if (!session) {
      return;
    }

    const fromOutbox = (await loadPendingMessages(session.userId)).find(
      (item) => item.chatId === chatId && item.id === messageId
    );
    const fromChat = chats
      .find((chat) => chat.id === chatId)
      ?.messages.find((message) => message.id === messageId && message.author === 'me');

    if (!fromOutbox && !fromChat) {
      return;
    }

    const payload = {
      userId: session.userId,
      chatId,
      clientId: messageId,
      text: fromOutbox?.text ?? fromChat?.text ?? '',
      sentAt: fromOutbox?.sentAt ?? new Date().toISOString(),
      attempts: fromOutbox?.attempts ?? 0
    };

    setMessageStatus(chatId, messageId, 'sending');
    await upsertPendingMessage({
      id: payload.clientId,
      userId: payload.userId,
      chatId: payload.chatId,
      text: payload.text,
      sentAt: payload.sentAt,
      status: 'pending',
      attempts: payload.attempts
    });

    await sendPendingMessage(payload);
  }, [session, chats, setMessageStatus, sendPendingMessage]);

  return {
    sendMessage,
    retryMessage,
    markPendingAsFailed,
    flushOutbox
  };
}
