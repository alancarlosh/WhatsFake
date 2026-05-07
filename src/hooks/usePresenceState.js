import { useCallback, useEffect, useState } from 'react';

function normalizeIdentity(value) {
  return value.trim().toLowerCase();
}

function sortOnlineUsers(users) {
  return [...users].sort((a, b) => {
    if (a.isSelf && !b.isSelf) return -1;
    if (!a.isSelf && b.isSelf) return 1;
    const left = (a.name ?? a.username ?? a.userId ?? a.key).toLowerCase();
    const right = (b.name ?? b.username ?? b.userId ?? b.key).toLowerCase();
    return left.localeCompare(right);
  });
}

function getPresenceKey(payload) {
  if (payload.userId) return `id:${payload.userId}`;
  if (payload.username) return `username:${normalizeIdentity(payload.username)}`;
  if (payload.name) return `name:${normalizeIdentity(payload.name)}`;
  return null;
}

export function usePresenceState(session, setChats) {
  const [onlineUsersCount, setOnlineUsersCount] = useState(1);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const applyPresencePayload = useCallback(
    (payload) => {
      const normalizedUsername = payload.username ? normalizeIdentity(payload.username) : null;
      const normalizedName = payload.name ? normalizeIdentity(payload.name) : null;
      if (!normalizedUsername && !normalizedName) return;

      setChats((prev) =>
        prev.map((chat) => {
          const normalizedHandle = normalizeIdentity(chat.contactHandle.replace(/^@/, ''));
          const normalizedContactName = normalizeIdentity(chat.contactName);
          const match =
            (normalizedUsername !== null && normalizedHandle === normalizedUsername) ||
            (normalizedName !== null && normalizedContactName === normalizedName);

          if (!match || chat.isOnline === payload.isOnline) return chat;
          return { ...chat, isOnline: payload.isOnline };
        })
      );
    },
    [setChats]
  );

  const upsertOnlineUserFromPresence = useCallback(
    (payload) => {
      if (!session) return;

      const key = getPresenceKey(payload);
      if (!key) return;

      const selfKey = `id:${session.userId}`;
      setOnlineUsers((prev) => {
        const map = new Map(prev.map((user) => [user.key, user]));

        if (payload.isOnline) {
          const existing = map.get(key);
          map.set(key, {
            key,
            userId: payload.userId ?? existing?.userId,
            username: payload.username ?? existing?.username,
            name: payload.name ?? existing?.name,
            isSelf: payload.userId === session.userId || key === selfKey
          });
        } else {
          map.delete(key);
        }

        map.set(selfKey, {
          key: selfKey,
          userId: session.userId,
          username: session.username,
          name: session.name,
          isSelf: true
        });

        const sorted = sortOnlineUsers(Array.from(map.values()));
        setOnlineUsersCount(sorted.length);
        return sorted;
      });
    },
    [session]
  );

  const replaceOnlineUsersFromSnapshot = useCallback(
    (snapshot) => {
      if (!session) return;

      const selfKey = `id:${session.userId}`;
      const map = new Map();

      snapshot.forEach((item) => {
        const key = getPresenceKey(item);
        if (!key || !item.isOnline) return;

        map.set(key, {
          key,
          userId: item.userId,
          username: item.username,
          name: item.name,
          isSelf: item.userId === session.userId || key === selfKey
        });
      });

      map.set(selfKey, {
        key: selfKey,
        userId: session.userId,
        username: session.username,
        name: session.name,
        isSelf: true
      });

      const sorted = sortOnlineUsers(Array.from(map.values()));
      setOnlineUsers(sorted);
      setOnlineUsersCount(sorted.length);
    },
    [session]
  );

  useEffect(() => {
    if (!session) return;

    const selfKey = `id:${session.userId}`;
    setOnlineUsers([
      {
        key: selfKey,
        userId: session.userId,
        username: session.username,
        name: session.name,
        isSelf: true
      }
    ]);
    setOnlineUsersCount(1);
  }, [session]);

  const updateSelfPresenceName = useCallback(
    (name) => {
      if (!session) return;
      setOnlineUsers((prev) =>
        prev.map((user) => (user.userId === session.userId ? { ...user, name } : user))
      );
    },
    [session]
  );

  return {
    onlineUsers,
    onlineUsersCount,
    applyPresencePayload,
    upsertOnlineUserFromPresence,
    replaceOnlineUsersFromSnapshot,
    updateSelfPresenceName
  };
}
