const ROLE_OPTIONS = ['admin', 'member', 'readonly'];

export function GroupDetailsScreen({
  chat,
  members,
  contacts,
  loading = false,
  mutating = false,
  errorMessage = null,
  onBack,
  onRefresh,
  onAddMember,
  onRemoveMember,
  onChangeRole
}) {
  const myRole = chat.myRole ?? 'member';
  const canManageMembers = myRole === 'owner' || myRole === 'admin';
  const canManageRoles = myRole === 'owner' || myRole === 'admin';

  const memberIds = new Set(members.map((member) => member.userId));
  const availableContacts = contacts.filter((contact) => !memberIds.has(contact.id));

  return (
    <div className="wf-group-details">
      <div className="wf-chat-header">
        <button type="button" className="wf-link" onClick={onBack}>
          Atrás
        </button>

        <div className="wf-chat-header-main">
          <h2 className="wf-chat-header-title">{chat.contactName}</h2>
          <p className="wf-chat-header-status">Tu rol: {myRole}</p>
        </div>

        <button type="button" className="wf-link" onClick={onRefresh}>
          Actualizar
        </button>
      </div>

      <div className="wf-scroll-screen">
        {loading ? <p className="wf-help">Cargando miembros...</p> : null}
        {mutating ? <p className="wf-help">Aplicando cambios...</p> : null}
        {errorMessage ? <p className="wf-error">{errorMessage}</p> : null}

        <p className="wf-section-title">Miembros</p>
        {members.map((member) => {
          const displayName = member.name || member.username || member.userId;
          const canEditThisMember = canManageRoles && !member.isSelf && member.role !== 'owner';
          const canRemoveThisMember = canManageMembers && !member.isSelf && member.role !== 'owner';

          return (
            <div key={member.userId} className="wf-card">
              <div className="wf-row-between wf-gap-sm">
                <div>
                  <p className="wf-strong">{displayName}</p>
                  <p className="wf-help">{member.username ? `@${member.username}` : member.userId}</p>
                </div>
                <span className="wf-chip">{member.role.toUpperCase()}</span>
              </div>

              {canEditThisMember ? (
                <div className="wf-role-actions">
                  {ROLE_OPTIONS.map((roleOption) => (
                    <button
                      key={`${member.userId}-${roleOption}`}
                      type="button"
                      className={`wf-btn-chip ${member.role === roleOption ? 'is-active' : ''}`}
                      onClick={() => void onChangeRole(member.userId, roleOption)}
                    >
                      {roleOption}
                    </button>
                  ))}
                </div>
              ) : null}

              {canRemoveThisMember ? (
                <button
                  type="button"
                  className="wf-link-danger"
                  onClick={() => void onRemoveMember(member.userId)}
                >
                  Quitar del grupo
                </button>
              ) : null}
            </div>
          );
        })}

        <p className="wf-section-title">Agregar miembros</p>
        {!canManageMembers ? <p className="wf-help">No tienes permisos para agregar miembros.</p> : null}
        {canManageMembers && availableContacts.length === 0 ? (
          <p className="wf-help">No hay contactos disponibles para agregar.</p>
        ) : null}

        {canManageMembers
          ? availableContacts.map((contact) => (
              <div key={contact.id} className="wf-card wf-row-between">
                <div>
                  <p className="wf-strong">{contact.name}</p>
                  <p className="wf-help">{contact.handle}</p>
                </div>
                <button
                  type="button"
                  className="wf-btn-primary"
                  onClick={() => void onAddMember(contact.id)}
                >
                  Agregar
                </button>
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
