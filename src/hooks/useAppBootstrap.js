import { useEffect, useState } from 'react';
import { fetchChatsPage } from '../services/chatApi';
import { fetchContacts } from '../services/contactsApi';
import {
  loadCachedSession,
  loadCachedChats,
  loadCachedContacts,
  saveCachedChats,
  saveCachedContacts
} from '../services/localDb';

function resolvePersistenceMode() {
  const mode = import.meta.env?.VITE_PERSISTENCE_MODE ?? 'remote';
  return String(mode).trim().toLowerCase();
}

export function useAppBootstrap({
  session,
  chats,
  contacts,
  setSession,
  setChats,
  setContacts,
  setSelectedChatId,
  setContactsError,
  sortChatsByActivity,
  mergePendingMessagesIntoChats,
  upsertContacts,
  loadedMessagesRef
}) {
  const useIndexedCache = resolvePersistenceMode() === 'indexed';
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isBootstrappingChats, setIsBootstrappingChats] = useState(false);
  const [chatBootstrapError, setChatBootstrapError] = useState(null);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void loadCachedSession()
      .then((cachedSession) => {
        if (!isMounted || !cachedSession) {
          return;
        }
        setSession(cachedSession);
      })
      .finally(() => {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [setSession]);

  useEffect(() => {
    if (!useIndexedCache) {
      return;
    }
    if (!session) {
      return;
    }

    let isMounted = true;
    void loadCachedChats(session.userId).then((cachedChats) => {
      if (!isMounted || cachedChats.length === 0) {
        return;
      }
      setChats((prev) => (prev.length > 0 ? prev : sortChatsByActivity(cachedChats)));
      setSelectedChatId((prev) => prev ?? cachedChats[0]?.id ?? null);
    });

    return () => {
      isMounted = false;
    };
  }, [session, setChats, setSelectedChatId, sortChatsByActivity, useIndexedCache]);

  useEffect(() => {
    if (!useIndexedCache) {
      return;
    }
    if (!session) {
      return;
    }

    let isMounted = true;
    void loadCachedContacts(session.userId).then((cachedContacts) => {
      if (!isMounted || cachedContacts.length === 0) {
        return;
      }
      setContacts((prev) => (prev.length > 0 ? prev : cachedContacts));
    });

    return () => {
      isMounted = false;
    };
  }, [session, setContacts, useIndexedCache]);

  useEffect(() => {
    if (!useIndexedCache) {
      return;
    }
    if (!session) {
      return;
    }
    void saveCachedChats(session.userId, chats);
  }, [session, chats, useIndexedCache]);

  useEffect(() => {
    if (!useIndexedCache) {
      return;
    }
    if (!session) {
      return;
    }
    void saveCachedContacts(session.userId, contacts);
  }, [session, contacts, useIndexedCache]);

  useEffect(() => {
    if (!session || chats.length === 0) {
      return;
    }
    const derived = chats.map((chat) => {
      if (chat.isGroup) {
        return null;
      }
      const handle = chat.contactHandle.startsWith('@') ? chat.contactHandle : `@${chat.contactHandle}`;
      if (handle.replace(/^@/, '').toLowerCase() === session.username.toLowerCase()) {
        return null;
      }
      return {
        id: chat.id,
        name: chat.contactName,
        handle,
        avatar: chat.avatar
      };
    }).filter(Boolean);

    upsertContacts(derived);
  }, [session, chats, upsertContacts]);

  useEffect(() => {
    if (!session) {
      return;
    }

    setIsBootstrappingChats(true);
    setChatBootstrapError(null);
    loadedMessagesRef.current.clear();

    void fetchChatsPage(session.token, { limit: 30 })
      .then((page) => {
        if (!useIndexedCache) {
          return page.items;
        }
        return mergePendingMessagesIntoChats(page.items, session.userId);
      })
      .then((nextChats) => {
        setChats(sortChatsByActivity(nextChats));
        const firstChatId = nextChats[0]?.id ?? null;
        setSelectedChatId(firstChatId);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los chats.';
        setChatBootstrapError(message);
      })
      .finally(() => {
        setIsBootstrappingChats(false);
      });
  }, [session, loadedMessagesRef, mergePendingMessagesIntoChats, setChats, setSelectedChatId, sortChatsByActivity, useIndexedCache]);

  useEffect(() => {
    if (!session) {
      return;
    }

    setIsLoadingContacts(true);
    setContactsError(null);

    void fetchContacts(session.token)
      .then((list) => {
        upsertContacts(list);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar los contactos.';
        setContactsError(message);
      })
      .finally(() => {
        setIsLoadingContacts(false);
      });
  }, [session, setContactsError, upsertContacts]);

  return {
    isRestoringSession,
    isBootstrappingChats,
    chatBootstrapError,
    isLoadingContacts
  };
}
