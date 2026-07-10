import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Building2, Phone, Mail, Globe, MapPin, Edit2,
  Plus, FileText, Receipt, CreditCard, CheckSquare2,
  BookOpen, Folder, StickyNote, CalendarDays, MessageCircle,
  Clock, BarChart2, Activity, AlertTriangle, Heart, Zap,
  MoreVertical, RefreshCcw, Layers,
} from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

// Tab Components
import OverviewTab from '@/components/customer/OverviewTab'
import TimelineTab from '@/components/customer/TimelineTab'
import InvoicesTab from '@/components/customer/InvoicesTab'
import QuotationsTab from '@/components/customer/QuotationsTab'
import PaymentsTab from '@/components/customer/PaymentsTab'
import TasksTab from '@/components/customer/TasksTab'
import SOPTab from '@/components/customer/SOPTab'
import FilesTab from '@/components/customer/FilesTab'
import NotesTab from '@/components/customer/NotesTab'
import MeetingsTab from '@/components/customer/MeetingsTab'
import LeadHistoryTab from '@/components/customer/LeadHistoryTab'
import CommunicationTab from '@/components/customer/CommunicationTab'
import ReportsTab from '@/components/customer/ReportsTab'
import CustomerOpsTab from '@/components/customer/CustomerOpsTab'

const TABS = [
  { key: 'overview',      label: 'Overview',      icon: Building2 },
  { key: 'timeline',      label: 'Timeline',      icon: Activity },
  { key: 'invoices',      label: 'Invoices',       icon: Receipt },
  { key: 'quotations',    label: 'Quotations',     icon: FileText },
  { key: 'payments',      label: 'Payments',       icon: CreditCard },
  { key: 'tasks',         label: 'Tasks',          icon: CheckSquare2 },
  { key: 'sop',           label: 'SOP Progress',   icon: BookOpen },
  { key: 'operations',    label: 'Operations',     icon: Layers },
  { key: 'files',         label: 'Files',          icon: Folder },
  { key: 'notes',         label: 'Notes',          icon: StickyNote },
  { key: 'meetings',      label: 'Meetings',       icon: CalendarDays },
  { key: 'lead_history',  label: 'Lead History',   icon: Clock },
  { key: 'communication', label: 'Communication',  icon: MessageCircle },
  { key: 'reports',       label: 'Reports',        icon: BarChart2 },
]

const HEALTH_CONFIG = {
  healthy:   { label: 'Healthy',   color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30', icon: Heart },
  attention: { label: 'Attention', color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/30', icon: AlertTriangle },
  critical:  { label: 'Critical',  color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30', icon: Zap },
}

function fmt(n) {
  if (!n) return '₹0'
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toLocaleString()}`
}

export default function CustomerWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [showEditModal, setShowEditModal] = useState(false)
  const qc = useQueryClient()

  const { data: wsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['customer-workspace', id],
    queryFn: () => api.get(`/customers/${id}/workspace`).then(r => r.data.data),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: !!id,
  })

  const { register, handleSubmit, reset, setValue, formState: { isSubmitting } } = useForm()

  const client = wsData?.client
  const stats = wsData?.stats

  const health = HEALTH_CONFIG[client?.healthStatus || 'healthy']
  const HealthIcon = health.icon

  const handleEditSubmit = async (data) => {
    try {
      await api.put(`/clients/${id}`, data)
      qc.invalidateQueries(['customer-workspace', id])
      qc.invalidateQueries(['clients'])
      toast.success('Client updated')
      setShowEditModal(false)
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Update failed')
    }
  }

  const openEdit = () => {
    if (!client) return
    reset({
      companyName: client.companyName,
      brandName: client.brandName,
      industry: client.industry,
      contactPerson: client.contactPerson,
      email: client.email,
      phone: client.phone,
      website: client.website,
      gstNumber: client.gstNumber,
      panNumber: client.panNumber,
      businessType: client.businessType,
      package: client.package,
      plan: client.plan,
      renewalDate: client.renewalDate ? client.renewalDate.split('T')[0] : '',
      status: client.status,
    })
    setShowEditModal(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <RefreshCcw className="w-5 h-5 animate-spin mr-2" />
        Loading workspace…
      </div>
    )
  }

  if (!client) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Client not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/clients')}>
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Clients
        </Button>
      </div>
    )
  }

  const tabProps = { clientId: id, client, stats }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Workspace Header ── */}
      <div className="border-b border-border pb-4 mb-0 shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => navigate('/clients')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl font-bold shrink-0">
              {client.companyName?.charAt(0)?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold leading-tight">{client.companyName}</h1>
                {client.brandName && client.brandName !== client.companyName && (
                  <span className="text-sm text-muted-foreground">({client.brandName})</span>
                )}
                <Badge variant={client.status === 'active' ? 'success' : client.status === 'inactive' ? 'secondary' : 'info'}
                  className="capitalize">
                  {client.status}
                </Badge>
                <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium ${health.bg} ${health.color}`}>
                  <HealthIcon className="w-3 h-3" />{health.label}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {client.contactPerson && (
                  <span className="text-sm text-muted-foreground">{client.contactPerson}</span>
                )}
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Phone className="w-3 h-3" />{client.phone}
                  </a>
                )}
                {client.email && (
                  <a href={`mailto:${client.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="w-3 h-3" />{client.email}
                  </a>
                )}
                {client.package && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{client.package}</span>
                )}
              </div>
            </div>
          </div>

          {/* KPI pills + actions */}
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { label: 'Total Revenue', value: fmt(stats?.totalRevenue) },
              { label: 'Outstanding',   value: fmt(stats?.outstandingAmount), warn: (stats?.outstandingAmount || 0) > 0 },
              { label: 'Open Tasks',    value: (stats?.tasks?.pending || 0) + (stats?.tasks?.in_progress || 0) },
            ].map(k => (
              <div key={k.label} className="text-center px-3 py-1.5 rounded-lg bg-card border border-border">
                <p className={`text-sm font-semibold ${k.warn && k.value !== '₹0' ? 'text-amber-400' : ''}`}>{k.value}</p>
                <p className="text-[10px] text-muted-foreground">{k.label}</p>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" className="gap-1.5" onClick={openEdit}>
              <Edit2 className="w-3.5 h-3.5" />Edit
            </Button>
          </div>
        </div>

        {/* ── Tab navigation ── */}
        <div className="flex gap-1 mt-4 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto pt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {activeTab === 'overview'      && <OverviewTab       {...tabProps} onEdit={openEdit} />}
            {activeTab === 'timeline'      && <TimelineTab       {...tabProps} />}
            {activeTab === 'invoices'      && <InvoicesTab       {...tabProps} />}
            {activeTab === 'quotations'    && <QuotationsTab     {...tabProps} />}
            {activeTab === 'payments'      && <PaymentsTab       {...tabProps} />}
            {activeTab === 'tasks'         && <TasksTab          {...tabProps} />}
            {activeTab === 'sop'           && <SOPTab            {...tabProps} />}
            {activeTab === 'operations'    && <CustomerOpsTab    {...tabProps} />}
            {activeTab === 'files'         && <FilesTab          {...tabProps} />}
            {activeTab === 'notes'         && <NotesTab          {...tabProps} />}
            {activeTab === 'meetings'      && <MeetingsTab       {...tabProps} />}
            {activeTab === 'lead_history'  && <LeadHistoryTab    {...tabProps} />}
            {activeTab === 'communication' && <CommunicationTab  {...tabProps} />}
            {activeTab === 'reports'       && <ReportsTab        {...tabProps} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Edit Client Modal ── */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Edit Client — {client.companyName}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(handleEditSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Company Name *</Label>
                <Input {...register('companyName', { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Brand Name</Label>
                <Input {...register('brandName')} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Person *</Label>
                <Input {...register('contactPerson', { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Input {...register('industry')} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input {...register('email')} type="email" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input {...register('phone')} />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input {...register('website')} />
              </div>
              <div className="space-y-1.5">
                <Label>Business Type</Label>
                <Input {...register('businessType')} placeholder="e.g. Private Ltd, LLP" />
              </div>
              <div className="space-y-1.5">
                <Label>GST Number</Label>
                <Input {...register('gstNumber')} />
              </div>
              <div className="space-y-1.5">
                <Label>PAN Number</Label>
                <Input {...register('panNumber')} />
              </div>
              <div className="space-y-1.5">
                <Label>Package</Label>
                <Input {...register('package')} placeholder="e.g. Performance Marketing" />
              </div>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Input {...register('plan')} placeholder="e.g. Premium, Growth" />
              </div>
              <div className="space-y-1.5">
                <Label>Renewal Date</Label>
                <Input {...register('renewalDate')} type="date" />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select onValueChange={v => setValue('status', v)} defaultValue={client.status || 'active'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['active', 'inactive', 'prospect'].map(s => (
                      <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>Update Client</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
