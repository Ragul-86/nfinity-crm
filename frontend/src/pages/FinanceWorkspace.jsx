import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, Receipt, FileText, CreditCard,
  TrendingUp, CalendarClock, BookMinus, BookPlus,
  BarChart3, IndianRupee,
} from 'lucide-react'

import FinanceDashboardTab   from '@/components/finance/FinanceDashboardTab'
import GlobalInvoicesTab     from '@/components/finance/GlobalInvoicesTab'
import GlobalQuotationsTab   from '@/components/finance/GlobalQuotationsTab'
import GlobalPaymentsTab     from '@/components/finance/GlobalPaymentsTab'
import CollectionTab         from '@/components/finance/CollectionTab'
import InstallmentsTab       from '@/components/finance/InstallmentsTab'
import CreditNotesTab        from '@/components/finance/CreditNotesTab'
import DebitNotesTab         from '@/components/finance/DebitNotesTab'
import GSTSummaryTab         from '@/components/finance/GSTSummaryTab'
import RevenueReportTab      from '@/components/finance/RevenueReportTab'

const TABS = [
  { id: 'dashboard',    label: 'Dashboard',     icon: LayoutDashboard },
  { id: 'invoices',     label: 'Invoices',       icon: Receipt },
  { id: 'quotations',   label: 'Quotations',     icon: FileText },
  { id: 'payments',     label: 'Payments',       icon: CreditCard },
  { id: 'collections',  label: 'Collections',    icon: TrendingUp },
  { id: 'installments', label: 'Installments',   icon: CalendarClock },
  { id: 'credit-notes', label: 'Credit Notes',   icon: BookMinus },
  { id: 'debit-notes',  label: 'Debit Notes',    icon: BookPlus },
  { id: 'gst',          label: 'GST Summary',    icon: IndianRupee },
  { id: 'revenue',      label: 'Revenue',        icon: BarChart3 },
]

const tabVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18 } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.1 } },
}

export default function FinanceWorkspace() {
  const [activeTab, setActiveTab] = useState('dashboard')

  function renderTab() {
    switch (activeTab) {
      case 'dashboard':    return <FinanceDashboardTab />
      case 'invoices':     return <GlobalInvoicesTab />
      case 'quotations':   return <GlobalQuotationsTab />
      case 'payments':     return <GlobalPaymentsTab />
      case 'collections':  return <CollectionTab />
      case 'installments': return <InstallmentsTab />
      case 'credit-notes': return <CreditNotesTab />
      case 'debit-notes':  return <DebitNotesTab />
      case 'gst':          return <GSTSummaryTab />
      case 'revenue':      return <RevenueReportTab />
      default:             return null
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-border shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <IndianRupee className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Finance Workspace</h1>
            <p className="text-xs text-muted-foreground">Invoices · Quotations · Payments · GST · Revenue</p>
          </div>
        </div>

        {/* Tab bar — horizontal scroll on small screens */}
        <div className="flex gap-0.5 overflow-x-auto scrollbar-hide -mb-px">
          {TABS.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors
                  ${active
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} variants={tabVariants} initial="initial" animate="animate" exit="exit">
            {renderTab()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
