/**
 * PlatformDataTable — shared enterprise table component
 * Features: Search, Filters, Sorting, Pagination, Export CSV, Column Visibility, Bulk Actions
 */
import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, ChevronUp, ChevronDown, ChevronsUpDown,
  Download, Eye, EyeOff, CheckSquare, Square, MoreHorizontal,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter,
  SlidersHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'

function exportToCSV(data, columns, filename) {
  if (!data.length) return
  const visibleCols = columns.filter(c => c.exportable !== false)
  const headers = visibleCols.map(c => c.header || c.key).join(',')
  const rows = data.map(row =>
    visibleCols.map(c => {
      const val = c.exportValue ? c.exportValue(row) : (row[c.key] ?? '')
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${filename || 'export'}-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

/**
 * @param {object} props
 * @param {Array}  props.columns        — column defs: { key, header, render, sortable, hidden, exportable, exportValue }
 * @param {Array}  props.data           — full dataset (server or client)
 * @param {number} props.total          — total record count (for server-side pagination)
 * @param {boolean} props.loading
 * @param {string}  props.searchPlaceholder
 * @param {string}  props.emptyMessage
 * @param {string}  props.filename      — CSV export filename
 * @param {Array}   props.filters       — [{ key, label, options: [{value, label}] }]
 * @param {object}  props.filterValues  — { [key]: value }
 * @param {Function} props.onFilterChange
 * @param {string}   props.search
 * @param {Function} props.onSearchChange
 * @param {number}   props.page
 * @param {number}   props.pageSize
 * @param {Function} props.onPageChange
 * @param {Function} props.onPageSizeChange
 * @param {Array}    props.bulkActions  — [{ label, icon: Icon, action: (selectedIds) => {}, variant }]
 * @param {Array}    props.rowActions   — passed to render context
 * @param {Function} props.onSort       — (key, dir) => {}
 * @param {string}   props.sortKey
 * @param {string}   props.sortDir
 * @param {Function} props.getRowId     — row => id string
 * @param {node}     props.toolbar      — extra toolbar content
 */
export default function PlatformDataTable({
  columns = [],
  data = [],
  total,
  loading = false,
  searchPlaceholder = 'Search…',
  emptyMessage = 'No records found.',
  filename = 'export',
  filters = [],
  filterValues = {},
  onFilterChange,
  search = '',
  onSearchChange,
  page = 1,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  bulkActions = [],
  onSort,
  sortKey,
  sortDir,
  getRowId = (row) => row._id || row.id,
  toolbar,
  rowKeyField = '_id',
}) {
  const [hiddenCols, setHiddenCols] = useState(() =>
    new Set(columns.filter(c => c.hidden).map(c => c.key))
  )
  const [selected, setSelected] = useState(new Set())
  const [showFilters, setShowFilters] = useState(false)

  const visibleCols = useMemo(
    () => columns.filter(c => !hiddenCols.has(c.key)),
    [columns, hiddenCols]
  )

  const totalPages = Math.max(1, Math.ceil((total ?? data.length) / pageSize))
  const allIds = data.map(r => getRowId(r))
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id))
  const someSelected = allIds.some(id => selected.has(id)) && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      setSelected(s => { const n = new Set(s); allIds.forEach(id => n.delete(id)); return n })
    } else {
      setSelected(s => { const n = new Set(s); allIds.forEach(id => n.add(id)); return n })
    }
  }

  const toggleRow = (id) => {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleCol = (key) => {
    setHiddenCols(s => {
      const n = new Set(s)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  const handleSort = (col) => {
    if (!col.sortable || !onSort) return
    const dir = sortKey === col.key && sortDir === 'asc' ? 'desc' : 'asc'
    onSort(col.key, dir)
  }

  const SortIcon = ({ col }) => {
    if (!col.sortable) return null
    if (sortKey !== col.key) return <ChevronsUpDown className="w-3 h-3 ml-1 text-muted-foreground/50" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 ml-1 text-primary" />
      : <ChevronDown className="w-3 h-3 ml-1 text-primary" />
  }

  const hasActiveFilters = filters.some(f => filterValues[f.key] && filterValues[f.key] !== 'all')

  return (
    <div className="flex flex-col gap-3">
      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-2">
        {/* Top row: search + actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          {onSearchChange !== undefined && (
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => { onSearchChange(e.target.value); onPageChange?.(1) }}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {search && (
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => onSearchChange('')}>
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          )}

          {/* Filter toggle */}
          {filters.length > 0 && (
            <Button
              variant={showFilters || hasActiveFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(v => !v)}
            >
              <Filter className="w-3.5 h-3.5 mr-1.5" />
              Filters
              {hasActiveFilters && <span className="ml-1 bg-white/20 text-[10px] rounded-full px-1.5 py-0.5">{filters.filter(f => filterValues[f.key] && filterValues[f.key] !== 'all').length}</span>}
            </Button>
          )}

          {/* Column visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map(col => (
                <DropdownMenuItem
                  key={col.key}
                  onClick={() => toggleCol(col.key)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${!hiddenCols.has(col.key) ? 'bg-primary border-primary' : 'border-border'}`}>
                    {!hiddenCols.has(col.key) && <CheckSquare className="w-3 h-3 text-white" />}
                  </span>
                  {col.header || col.key}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToCSV(data, columns, filename)}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export
          </Button>

          {/* Custom toolbar slot */}
          {toolbar}
        </div>

        {/* Filter row */}
        <AnimatePresence>
          {showFilters && filters.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-2 pt-1">
                {filters.map(f => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{f.label}</label>
                    <select
                      value={filterValues[f.key] || 'all'}
                      onChange={e => { onFilterChange?.(f.key, e.target.value); onPageChange?.(1) }}
                      className="px-2.5 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="all">All</option>
                      {f.options?.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {hasActiveFilters && (
                  <div className="flex items-end">
                    <Button variant="ghost" size="sm" onClick={() => filters.forEach(f => onFilterChange?.(f.key, 'all'))}>
                      <X className="w-3.5 h-3.5 mr-1" /> Clear
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bulk action bar */}
        <AnimatePresence>
          {selected.size > 0 && bulkActions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg"
            >
              <span className="text-sm font-medium text-primary">{selected.size} selected</span>
              <div className="h-4 w-px bg-border mx-1" />
              {bulkActions.map((ba, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={ba.variant || 'outline'}
                  onClick={() => { ba.action([...selected]); setSelected(new Set()) }}
                >
                  {ba.icon && <ba.icon className="w-3.5 h-3.5 mr-1.5" />}
                  {ba.label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {bulkActions.length > 0 && (
                  <th className="w-10 px-3 py-3 text-left">
                    <button onClick={toggleAll} className="flex items-center">
                      {allSelected ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : someSelected ? (
                        <div className="w-4 h-4 border-2 border-primary rounded bg-primary/30" />
                      ) : (
                        <Square className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </th>
                )}
                {visibleCols.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap',
                      col.sortable && onSort ? 'cursor-pointer select-none hover:text-foreground' : '',
                      col.className,
                    )}
                    onClick={() => handleSort(col)}
                  >
                    <div className="flex items-center">
                      {col.header || col.key}
                      <SortIcon col={col} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                [...Array(pageSize < 10 ? pageSize : 8)].map((_, i) => (
                  <tr key={i}>
                    {bulkActions.length > 0 && <td className="px-3 py-3"><Skeleton className="h-4 w-4" /></td>}
                    {visibleCols.map(col => (
                      <td key={col.key} className="px-4 py-3">
                        <Skeleton className="h-4 w-full max-w-32" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.length + (bulkActions.length > 0 ? 1 : 0)} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Search className="w-8 h-8 opacity-30" />
                      <p className="text-sm">{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((row, rowIdx) => {
                  const id = getRowId(row)
                  const isSelected = selected.has(id)
                  return (
                    <motion.tr
                      key={id || rowIdx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: rowIdx * 0.02 }}
                      className={cn(
                        'hover:bg-accent/40 transition-colors',
                        isSelected && 'bg-primary/5'
                      )}
                    >
                      {bulkActions.length > 0 && (
                        <td className="px-3 py-3">
                          <button onClick={() => toggleRow(id)} className="flex items-center">
                            {isSelected
                              ? <CheckSquare className="w-4 h-4 text-primary" />
                              : <Square className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </td>
                      )}
                      {visibleCols.map(col => (
                        <td key={col.key} className={cn('px-4 py-3', col.cellClassName)}>
                          {col.render ? col.render(row, rowIdx) : (
                            <span className="text-sm text-foreground">{row[col.key] ?? '—'}</span>
                          )}
                        </td>
                      ))}
                    </motion.tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {(onPageChange || data.length > 0) && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={e => { onPageSizeChange?.(Number(e.target.value)); onPageChange?.(1) }}
                className="px-2 py-1 rounded border border-input bg-background text-xs"
              >
                {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="hidden sm:inline">
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total ?? data.length)} of {total ?? data.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => onPageChange?.(1)} disabled={page === 1}>
                <ChevronsLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => onPageChange?.(page - 1)} disabled={page === 1}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                {page} / {totalPages}
              </span>
              <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => onPageChange?.(page + 1)} disabled={page >= totalPages}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => onPageChange?.(totalPages)} disabled={page >= totalPages}>
                <ChevronsRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helper: cn ──
function cn(...classes) { return classes.filter(Boolean).join(' ') }
