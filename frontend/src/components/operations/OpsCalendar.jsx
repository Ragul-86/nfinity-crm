import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, CalendarDays, CheckSquare, BookOpen,
  Clock, Receipt, RefreshCcw, Phone, Repeat,
} from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  subMonths, addWeeks, subWeeks, format, isSameDay, isSameMonth,
  isToday, parseISO,
} from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import api from '@/services/api'

const REFRESH_MS = 60_000

const EVENT_COLORS = {
  task:    { bg: 'bg-blue-500/15',   text: 'text-blue-400',   icon: CheckSquare,    dot: 'bg-blue-500' },
  meeting: { bg: 'bg-purple-500/15', text: 'text-purple-400', icon: CalendarDays,   dot: 'bg-purple-500' },
  followup:{ bg: 'bg-amber-500/15',  text: 'text-amber-400',  icon: Phone,          dot: 'bg-amber-500' },
  invoice: { bg: 'bg-red-500/15',    text: 'text-red-400',    icon: Receipt,    dot: 'bg-red-500' },
  renewal: { bg: 'bg-green-500/15',  text: 'text-green-400',  icon: Repeat,         dot: 'bg-green-500' },
  sop:     { bg: 'bg-indigo-500/15', text: 'text-indigo-400', icon: BookOpen,       dot: 'bg-indigo-500' },
}

const VIEWS = ['month', 'week', 'agenda']
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getEventsForDay(events, day) {
  return events.filter(e => e.date && isSameDay(parseISO(e.date.slice(0, 10)), day))
}

// ─── Event Pill ───────────────────────────────────────────────────────────────
function EventPill({ event, onClick }) {
  const cfg = EVENT_COLORS[event.type] || EVENT_COLORS['task']
  return (
    <button
      onClick={() => onClick(event)}
      className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate ${cfg.bg} ${cfg.text} hover:opacity-80 transition-opacity`}
    >
      {event.title}
    </button>
  )
}

// ─── Day Events Detail Modal ──────────────────────────────────────────────────
function DayModal({ day, events, open, onClose }) {
  if (!day) return null
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{format(day, 'EEEE, MMMM d, yyyy')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 mt-2">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No events this day</p>
          ) : events.map((e, i) => {
            const cfg = EVENT_COLORS[e.type] || EVENT_COLORS['task']
            const Icon = cfg.icon
            return (
              <div key={i} className={`flex items-start gap-2 p-3 rounded-xl ${cfg.bg}`}>
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.text}`} />
                <div>
                  <p className={`text-sm font-medium ${cfg.text}`}>{e.title}</p>
                  {e.client && <p className="text-xs text-muted-foreground">{e.client}</p>}
                  <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground">
                    {e.date && <span>{format(new Date(e.date), 'h:mm a')}</span>}
                    {e.type === 'meeting' && e.duration && <span>{e.duration}min</span>}
                    {e.status && <span className="capitalize">{e.status.replace(/_/g, ' ')}</span>}
                    {e.type === 'invoice' && e.extra?.amount && <span>₹{Number(e.extra.amount).toLocaleString('en-IN')}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Month View ───────────────────────────────────────────────────────────────
function MonthView({ currentDate, events, onDayClick }) {
  const firstDay  = startOfMonth(currentDate)
  const lastDay   = endOfMonth(currentDate)
  const gridStart = startOfWeek(firstDay)
  const gridEnd   = endOfWeek(lastDay)

  const days = []
  let d = gridStart
  while (d <= gridEnd) { days.push(d); d = addDays(d, 1) }

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map(l => (
          <div key={l} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-l border-t border-border">
        {days.map((day, i) => {
          const dayEvents  = getEventsForDay(events, day)
          const inMonth    = isSameMonth(day, currentDate)
          const todayDay   = isToday(day)
          const maxVisible = 3

          return (
            <div
              key={i}
              onClick={() => onDayClick(day, dayEvents)}
              className={`border-r border-b border-border min-h-[80px] p-1 cursor-pointer hover:bg-accent/30 transition-colors ${!inMonth ? 'opacity-40' : ''}`}
            >
              <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1 ${todayDay ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, maxVisible).map((e, j) => <EventPill key={j} event={e} onClick={() => {}} />)}
                {dayEvents.length > maxVisible && (
                  <p className="text-[9px] text-muted-foreground pl-1">+{dayEvents.length - maxVisible} more</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week View ────────────────────────────────────────────────────────────────
function WeekView({ currentDate, events, onDayClick }) {
  const weekStart = startOfWeek(currentDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="grid grid-cols-7 border-l border-t border-border">
      {days.map((day, i) => {
        const dayEvents = getEventsForDay(events, day)
        const todayDay  = isToday(day)
        return (
          <div key={i} className="border-r border-b border-border min-h-[200px] p-2 cursor-pointer hover:bg-accent/20 transition-colors"
            onClick={() => onDayClick(day, dayEvents)}>
            <div className="text-center mb-2">
              <p className="text-[10px] text-muted-foreground">{DAY_LABELS[i]}</p>
              <div className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium mx-auto ${todayDay ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                {format(day, 'd')}
              </div>
            </div>
            <div className="space-y-1">
              {dayEvents.map((e, j) => <EventPill key={j} event={e} onClick={() => {}} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Agenda View ──────────────────────────────────────────────────────────────
function AgendaView({ currentDate, events }) {
  // Show next 30 days from the start of the current week
  const start = startOfWeek(currentDate)
  const days = Array.from({ length: 30 }, (_, i) => addDays(start, i))

  const agenda = days
    .map(day => ({ day, events: getEventsForDay(events, day) }))
    .filter(d => d.events.length > 0)

  if (agenda.length === 0) {
    return <p className="text-center text-muted-foreground py-16">No events in the next 30 days</p>
  }

  return (
    <div className="space-y-4">
      {agenda.map(({ day, events: dayEvts }) => (
        <div key={day.toISOString()}>
          <div className={`flex items-center gap-2 mb-2 ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>
            <div className={`w-2 h-2 rounded-full ${isToday(day) ? 'bg-primary' : 'bg-muted'}`} />
            <p className="text-sm font-semibold">{format(day, 'EEEE, MMMM d')}</p>
            {isToday(day) && <Badge variant="outline" className="text-[10px] py-0 px-1 text-primary border-primary">Today</Badge>}
          </div>
          <div className="ml-4 space-y-1.5">
            {dayEvts.map((e, i) => {
              const cfg  = EVENT_COLORS[e.type] || EVENT_COLORS['task']
              const Icon = cfg.icon
              return (
                <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-xl ${cfg.bg}`}>
                  <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.text}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium ${cfg.text} truncate`}>{e.title}</p>
                    <div className="flex gap-3 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
                      {e.client && <span>{e.client}</span>}
                      {e.date && <span>{format(new Date(e.date), 'h:mm a')}</span>}
                      {e.type === 'meeting' && e.duration && <span>{e.duration}min</span>}
                      {e.status && <span className="capitalize">{e.status.replace(/_/g, ' ')}</span>}
                    </div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${cfg.bg} ${cfg.text} capitalize shrink-0`}>
                    {e.type}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Calendar ────────────────────────────────────────────────────────────
export default function OpsCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView]               = useState('month')
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedEvents, setSelectedEvents] = useState([])
  const [showDayModal, setShowDayModal] = useState(false)

  // Date range for the current view
  const { dateFrom, dateTo } = useMemo(() => {
    if (view === 'week') {
      const ws = startOfWeek(currentDate)
      return { dateFrom: format(addDays(ws, -7), 'yyyy-MM-dd'), dateTo: format(addDays(endOfWeek(currentDate), 7), 'yyyy-MM-dd') }
    }
    const ms = addMonths(startOfMonth(currentDate), -1)
    const me = addMonths(endOfMonth(currentDate), 2)
    return { dateFrom: format(ms, 'yyyy-MM-dd'), dateTo: format(me, 'yyyy-MM-dd') }
  }, [currentDate, view])

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['ops-calendar', dateFrom, dateTo],
    queryFn: () => api.get('/operations/calendar', { params: { dateFrom, dateTo } }).then(r => r.data.data),
    refetchInterval: REFRESH_MS,
  })

  const events = data || []

  const navigate = (dir) => {
    if (view === 'month') setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    else if (view === 'week') setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1))
    else setCurrentDate(dir > 0 ? addDays(currentDate, 30) : addDays(currentDate, -30))
  }

  const handleDayClick = (day, dayEvents) => {
    setSelectedDay(day)
    setSelectedEvents(dayEvents)
    setShowDayModal(true)
  }

  const typeGroups = events.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc }, {})

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg border border-border hover:bg-accent">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-base font-semibold min-w-[180px] text-center">
            {view === 'week'
              ? `${format(startOfWeek(currentDate), 'MMM d')} – ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`
              : view === 'month'
              ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
              : `Next 30 days from ${format(startOfWeek(currentDate), 'MMM d')}`
            }
          </h2>
          <button onClick={() => navigate(1)} className="p-1.5 rounded-lg border border-border hover:bg-accent">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground">
            Today
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="p-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground">
            <RefreshCcw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex border border-border rounded-lg overflow-hidden">
            {VIEWS.map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs capitalize ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(EVENT_COLORS).map(([type, cfg]) => {
          const count = typeGroups[type] || 0
          if (count === 0) return null
          return (
            <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className="capitalize">{type}</span>
              <span className="font-medium text-foreground">{count}</span>
            </div>
          )
        })}
      </div>

      {/* Calendar Body */}
      {isLoading ? (
        <Skeleton className="w-full h-[400px] rounded-xl" />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {view === 'month' && <MonthView currentDate={currentDate} events={events} onDayClick={handleDayClick} />}
          {view === 'week'  && <WeekView  currentDate={currentDate} events={events} onDayClick={handleDayClick} />}
          {view === 'agenda'&& <div className="p-4"><AgendaView currentDate={currentDate} events={events} /></div>}
        </div>
      )}

      {/* Day Detail Modal */}
      <DayModal
        day={selectedDay} events={selectedEvents}
        open={showDayModal} onClose={() => setShowDayModal(false)}
      />
    </div>
  )
}
