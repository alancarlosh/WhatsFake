import { useCallback, useState } from 'react';
import { fetchChats } from '../services/chatApi';
import { addGroupMember, fetchGroupMembers, removeGroupMember, updateGroupMemberRole } from '../services/groupApi';

export function useGroupManagement({ session, selectedChat, setChats, sortChatsByActivity }) {
  const [isGroupDetailsOpen, setIsGroupDetailsOpen] = useState(false);
  const [groupMembersByChat, setGroupMembersByChat] = useState({});
  const [isLoadingGroupMembers, setIsLoadingGroupMembers] = useState(false);
  const [isMutatingGroup, setIsMutatingGroup] = useState(false);
  const [groupMembersError, setGroupMembersError] = useState(null);

  const syncGroupMembers = useCallback((chatId, members) => {
    setGroupMembersByChat((prev) => ({ ...prev, [chatId]: members }));
  }, []);

  const loadGroupMembers = useCallback(
    async (chatId) => {
      if (!session) return;

      setIsLoadingGroupMembers(true);
      setGroupMembersError(null);
      try {
        const members = await fetchGroupMembers(session.token, chatId);
        const normalized = members.map((member) => ({ ...member, isSelf: member.userId === session.userId }));
        syncGroupMembers(chatId, normalized);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No se pudieron cargar los miembros del grupo.';
        setGroupMembersError(message);
      } finally {
        setIsLoadingGroupMembers(false);
      }
    },
    [session, syncGroupMembers]
  );

  const openGroupDetails = useCallback(() => {
    if (!selectedChat || !selectedChat.isGroup) return;
    setIsGroupDetailsOpen(true);
    void loadGroupMembers(selectedChat.id);
  }, [selectedChat, loadGroupMembers]);

  const closeGroupDetails = useCallback(() => {
    setIsGroupDetailsOpen(false);
    setGroupMembersError(null);
  }, []);

  const handleAddGroupMember = useCallback(
    async (userId) => {
      if (!session || !selectedChat) return;

      setIsMutatingGroup(true);
      setGroupMembersError(null);
      try {
        await addGroupMember(session.token, selectedChat.id, userId);
        await loadGroupMembers(selectedChat.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo agregar miembro.';
        setGroupMembersError(message);
      } finally {
        setIsMutatingGroup(false);
      }
    },
    [session, selectedChat, loadGroupMembers]
  );

  const handleRemoveGroupMember = useCallback(
    async (userId) => {
      if (!session || !selectedChat) return;

      setIsMutatingGroup(true);
      setGroupMembersError(null);
      try {
        await removeGroupMember(session.token, selectedChat.id, userId);
        await loadGroupMembers(selectedChat.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo quitar miembro.';
        setGroupMembersError(message);
      } finally {
        setIsMutatingGroup(false);
      }
    },
    [session, selectedChat, loadGroupMembers]
  );

  const handleChangeGroupRole = useCallback(
    async (userId, role) => {
      if (!session || !selectedChat) return;

      setIsMutatingGroup(true);
      setGroupMembersError(null);
      try {
        await updateGroupMemberRole(session.token, selectedChat.id, userId, role);
        await loadGroupMembers(selectedChat.id);
        const refreshedChats = await fetchChats(session.token);
        setChats(sortChatsByActivity(refreshedChats));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo actualizar el rol.';
        setGroupMembersError(message);
      } finally {
        setIsMutatingGroup(false);
      }
    },
    [session, selectedChat, loadGroupMembers, setChats, sortChatsByActivity]
  );

  const selectedGroupMembers = selectedChat ? groupMembersByChat[selectedChat.id] ?? [] : [];

  return {
    isGroupDetailsOpen,
    selectedGroupMembers,
    isLoadingGroupMembers,
    isMutatingGroup,
    groupMembersError,
    setGroupMembersByChat,
    syncGroupMembers,
    loadGroupMembers,
    openGroupDetails,
    closeGroupDetails,
    handleAddGroupMember,
    handleRemoveGroupMember,
    handleChangeGroupRole
  };
}
