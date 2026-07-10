import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, Pin, Edit2, Trash2, StickyNote, Check, X } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import toast from 'react-hot-toast'

function NoteCard({ note, onPin, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(note.content)

  const handleSave = () => {
    onEdit(note._id, content)
    setEditing(false)
  }

  return (
    <div className={`bg-card border rounded-xl p-4 transition-all ${note.pinned ? 'border-primary/40 shadow-sm' : 'border-border'}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                className="min-h-[80px] text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave}><Check className="w-3.5 h-3.5 mr-1" />Save</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(false); setContent(note.content) }}>
                  <X className="w-3.5 h-3.5 mr-1" />Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{note.content}</p>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
            {note.author?.name && <span>{note.author.name}</span>}
            <span>{format(new Date(note.createdAt), 'MMM d, yyyy, h:mm a')}</span>
            {note.pinned && (
              <span className="text-primary font-medium flex items-center gap-0.5">
                <Pin className="w-2.5 h-2.5" />Pinned
              </span>
            )}
            {note.editHistory?.length > 0 && (
              <span className="text-muted-foreground">edited</span>
            )}
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" className={`h-7 w-7 ${note.pinned ? 'text-primary' : ''}`} onClick={() => onPin(note._id, !note.pinned)}>
              <Pin className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-400" onClick={() => onDelete(note._id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function NotesTab({ clientId }) {
  const qc = useQueryClient()
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['customer-notes', clientId],
    queryFn: () => api.get(`/customers/${clientId}/notes`).then(r => r.data.data),
  })

  const createNote = async () => {
    if (!newNote.trim()) return
    setSaving(true)
    try {
      await api.post(`/customers/${clientId}/notes`, { content: newNote.trim() })
      qc.invalidateQueries(['customer-notes', clientId])
      setNewNote('')
      toast.success('Note saved')
    } catch {
      toast.error('Failed to save note')
    } finally { setSaving(false) }
  }

  const updateMut = useMutation({
    mutationFn: ({ id, content }) => api.put(`/customers/notes/${id}`, { content }),
    onSuccess: () => { qc.invalidateQueries(['customer-notes', clientId]); toast.success('Note updated') },
    onError: () => toast.error('Update failed'),
  })

  const pinMut = useMutation({
    mutationFn: ({ id, pinned }) => api.put(`/customers/notes/${id}`, { pinned }),
    onSuccess: () => qc.invalidateQueries(['customer-notes', clientId]),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/customers/notes/${id}`),
    onSuccess: () => { qc.invalidateQueries(['customer-notes', clientId]); toast.success('Note deleted') },
    onError: () => toast.error('Delete failed'),
  })

  // Sort: pinned first, then by date desc
  const sorted = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.createdAt) - new Date(a.createdAt)
  })

  return (
    <div className="space-y-4">
      {/* New note composer */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <Textarea
          placeholder="Add a note…"
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          className="min-h-[80px] text-sm resize-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) createNote()
          }}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Ctrl+Enter to save</p>
          <Button size="sm" onClick={createNote} disabled={!newNote.trim() || saving}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />Save Note
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>}

      {!isLoading && sorted.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <StickyNote className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No notes yet</p>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(note => (
          <NoteCard
            key={note._id}
            note={note}
            onPin={(id, pinned) => pinMut.mutate({ id, pinned })}
            onEdit={(id, content) => updateMut.mutate({ id, content })}
            onDelete={id => { if (confirm('Delete this note?')) deleteMut.mutate(id) }}
          />
        ))}
      </div>
    </div>
  )
}
