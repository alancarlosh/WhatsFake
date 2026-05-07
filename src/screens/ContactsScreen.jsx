import { useMemo, useState } from 'react';
import { ContactItem } from '../components/ContactItem';

export function ContactsScreen({
  contacts,
  loading = false,
  creatingGroup = false,
  errorMessage = null,
  onStartChat,
  onCreateGroup
}) {
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const canCreateGroup = useMemo(
    () => groupName.trim().length >= 3 && selectedIds.length >= 2,
    [groupName, selectedIds]
  );

  const toggleSelected = (contactId) => {
    setSelectedIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  const handleContactPress = (contactId) => {
    if (groupMode) {
      toggleSelected(contactId);
      return;
    }

    const selectedContact = contacts.find((contact) => contact.id === contactId);
    if (!selectedContact) {
      return;
    }

    onStartChat(selectedContact);
  };

  const handleCreateGroup = async () => {
    if (!canCreateGroup || creatingGroup) {
      return;
    }

    await onCreateGroup(groupName.trim(), selectedIds);
    setGroupName('');
    setSelectedIds([]);
    setGroupMode(false);
  };

  return (
    <div className="wf-scroll-screen">
      <h1 className="wf-title">Contactos</h1>
      <p className="wf-subtitle">Empieza conversaciones nuevas con estilo limpio y responsive.</p>

      {loading ? <p className="wf-help">Cargando contactos...</p> : null}
      {errorMessage ? <p className="wf-error">{errorMessage}</p> : null}

      <section className="wf-card">
        <div className="wf-row-between">
          <h3 className="wf-card-title">Crear grupo</h3>
          <button type="button" className="wf-link" onClick={() => setGroupMode((prev) => !prev)}>
            {groupMode ? 'Cancelar' : 'Modo grupo'}
          </button>
        </div>

        {groupMode ? (
          <>
            <input
              className="wf-input"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="Nombre del grupo"
            />
            <p className="wf-help">Seleccionados: {selectedIds.length}</p>
            <button
              type="button"
              className="wf-btn-primary"
              onClick={() => void handleCreateGroup()}
              disabled={!canCreateGroup || creatingGroup}
            >
              {creatingGroup ? 'Creando grupo...' : 'Crear grupo'}
            </button>
          </>
        ) : null}
      </section>

      <div className="wf-stack">
        {contacts.map((contact) => (
          <ContactItem
            key={contact.id}
            id={contact.id}
            name={contact.name}
            handle={contact.handle}
            avatar={contact.avatar}
            selected={selectedIds.includes(contact.id)}
            actionLabel={groupMode ? (selectedIds.includes(contact.id) ? 'Quitar' : 'Agregar') : 'Mensaje'}
            onPress={handleContactPress}
          />
        ))}
        {!loading && contacts.length === 0 ? <p className="wf-help">Sin contactos disponibles.</p> : null}
      </div>
    </div>
  );
}
