import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, Folder, File, Trash2, Download, Image, FileText, Film, Archive } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

const FOLDERS = [
  { key: 'all',            label: 'All Files' },
  { key: 'contracts',      label: 'Contracts' },
  { key: 'invoices',       label: 'Invoices' },
  { key: 'quotations',     label: 'Quotations' },
  { key: 'gst',            label: 'GST' },
  { key: 'pan',            label: 'PAN' },
  { key: 'creatives',      label: 'Creatives' },
  { key: 'reports',        label: 'Reports' },
  { key: 'ads',            label: 'Ads' },
  { key: 'campaign_files', label: 'Campaign Files' },
  { key: 'general',        label: 'General' },
]

function fileIcon(type) {
  if (!type) return File
  if (type.startsWith('image/')) return Image
  if (type.startsWith('video/')) return Film
  if (type.includes('pdf') || type.includes('doc') || type.includes('text')) return FileText
  if (type.includes('zip') || type.includes('rar')) return Archive
  return File
}

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes > 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes > 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}

function AddFileDialog({ open, onClose, clientId, folder, onSaved }) {
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm({
    defaultValues: { name: '', fileUrl: '', fileType: '', folder: folder === 'all' ? 'general' : folder },
  })

  const onSubmit = async (data) => {
    try {
      await api.post(`/customers/${clientId}/files`, data)
      toast.success('File added')
      onSaved()
      onClose()
      reset()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Add File</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>File Name *</Label>
            <Input {...register('name', { required: true })} placeholder="e.g. Contract_2024.pdf" />
          </div>
          <div className="space-y-1.5">
            <Label>File URL *</Label>
            <Input {...register('fileUrl', { required: true })} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label>File Type</Label>
            <Input {...register('fileType')} placeholder="e.g. application/pdf" />
          </div>
          <div className="space-y-1.5">
            <Label>Folder</Label>
            <select {...register('folder')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {FOLDERS.filter(f => f.key !== 'all').map(f => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>Add File</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function FilesTab({ clientId }) {
  const qc = useQueryClient()
  const [activeFolder, setActiveFolder] = useState('all')
  const [showAdd, setShowAdd] = useState(false)

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['customer-files', clientId],
    queryFn: () => api.get(`/customers/${clientId}/files`).then(r => r.data.data),
  })

  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/customers/files/${id}`),
    onSuccess: () => { qc.invalidateQueries(['customer-files', clientId]); toast.success('File removed') },
    onError: () => toast.error('Delete failed'),
  })

  const displayed = activeFolder === 'all' ? files : files.filter(f => f.folder === activeFolder)

  // Count per folder
  const folderCounts = files.reduce((acc, f) => {
    acc[f.folder] = (acc[f.folder] || 0) + 1
    return acc
  }, {})

  if (isLoading) return <div className="text-center py-16 text-muted-foreground text-sm">Loading…</div>

  return (
    <div className="flex gap-4 h-full min-h-[400px]">
      {/* Folder sidebar */}
      <div className="w-44 shrink-0 space-y-0.5">
        {FOLDERS.map(f => (
          <button key={f.key} onClick={() => setActiveFolder(f.key)}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
              activeFolder === f.key ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}>
            <div className="flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 shrink-0" />
              <span>{f.label}</span>
            </div>
            {f.key !== 'all' && folderCounts[f.key] > 0 && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{folderCounts[f.key]}</span>
            )}
            {f.key === 'all' && files.length > 0 && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{files.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* File list */}
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{displayed.length} file{displayed.length !== 1 ? 's' : ''}</p>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />Add File
          </Button>
        </div>

        {displayed.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Folder className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No files in this folder</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map(file => {
              const Icon = fileIcon(file.fileType)
              return (
                <div key={file._id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                  <Icon className="w-8 h-8 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      {file.size && <span>{fmtSize(file.size)}</span>}
                      <span className="capitalize">{file.folder}</span>
                      <span>{format(new Date(file.createdAt), 'MMM d, yyyy')}</span>
                      {file.uploadedBy?.name && <span>by {file.uploadedBy.name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {file.fileUrl && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                        <a href={file.fileUrl} target="_blank" rel="noreferrer">
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-400"
                      onClick={() => { if (confirm('Remove file?')) deleteMut.mutate(file._id) }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AddFileDialog open={showAdd} onClose={() => setShowAdd(false)} clientId={clientId} folder={activeFolder}
        onSaved={() => qc.invalidateQueries(['customer-files', clientId])} />
    </div>
  )
}
