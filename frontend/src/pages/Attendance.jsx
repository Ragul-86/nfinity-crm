import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, LogIn, LogOut, Coffee, Users, UserCheck, UserX, AlarmClock,
  CalendarOff, TrendingUp, Plus, Trash2, Check, X, FileSpreadsheet, FileText, FileDown,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import PageHeader from '@/components/common/PageHeader'
import StatCard from '@/components/common/StatCard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'

const STATUS_VARIANTS = {
  present: 'success', absent: 'destructive', late: 'warning',
  half_day: 'info', leave: 'secondary', work_from_home: 'purple',
}
const LEAVE_STATUS_VARIANTS = { pending: 'warning', approved: 'success', rejected: 'destructive', cancelled: 'secondary' }
const LEAVE_TYPE_LABELS = { casual: 'Casual Leave', sick: 'Sick Leave', earned: 'Earned Leave', work_from_home: 'Work From Home' }
const ADMIN_ROLES = ['super_admin', 'admin', 'manager']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function statusLabel(s) { return (s || '').replace(/_/g, ' ') }
function fmtTime(d) { return d ? format(new Date(d), 'HH:mm') : '—' }
function fmtDate(d) { return d ? format(new Date(d), 'MMM d, yyyy') : '—' }

async function downloadBlob(url, params, filename) {
  const res = await api.get(url, { params, responseType: 'blob' })
  const blobUrl = URL.createObjectURL(new Blob([res.data]))
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(blobUrl)
}

export default function Attendance() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = ADMIN_ROLES.includes(user?.role)
  const now = new Date()
  const [month] = useState(now.getMonth() + 1)
  const [year] = useState(now.getFullYear())
  const [wfhToggle, setWfhToggle] = useState(false)

  const [markOpen, setMarkOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [teamDate, setTeamDate] = useState(format(now, 'yyyy-MM-dd'))

  const [reportType, setReportType] = useState('monthly')
  const [reportDate, setReportDate] = useState(format(now, 'yyyy-MM-dd'))
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1)
  const [reportYear, setReportYear] = useState(now.getFullYear())

  const [markForm, setMarkForm] = useState({ employee: '', date: format(now, 'yyyy-MM-dd'), status: 'present', clockIn: '', clockOut: '', notes: '' })
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'casual', startDate: format(now, 'yyyy-MM-dd'), endDate: format(now, 'yyyy-MM-dd'), reason: '' })

  // ---------- Queries ----------
  const ATT_REFRESH = 30_000

  const { data: todayData, isLoading: todayLoading } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get('/attendance/today').then(r => r.data.data),
    refetchInterval: ATT_REFRESH,
    refetchOnWindowFocus: true,
  })

  const { data: myAttendance, isLoading: historyLoading } = useQuery({
    queryKey: ['attendance-my', month, year],
    queryFn: () => api.get('/attendance/my', { params: { month, year } }).then(r => r.data.data),
    refetchInterval: ATT_REFRESH,
  })

  const { data: dashboardStats, isLoading: statsLoading } = useQuery({
    queryKey: ['attendance-dashboard-stats'],
    queryFn: () => api.get('/attendance/dashboard-stats').then(r => r.data.data),
    enabled: isAdmin,
    refetchInterval: ATT_REFRESH,
  })

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['attendance-trend'],
    queryFn: () => api.get('/attendance/trend', { params: { days: 14 } }).then(r => r.data.data),
    enabled: isAdmin,
    refetchInterval: ATT_REFRESH,
  })

  const { data: deptWise, isLoading: deptLoading } = useQuery({
    queryKey: ['attendance-dept-wise'],
    queryFn: () => api.get('/attendance/department-wise').then(r => r.data.data),
    enabled: isAdmin,
    refetchInterval: ATT_REFRESH,
  })

  const { data: monthlyOverview, isLoading: monthlyLoading } = useQuery({
    queryKey: ['attendance-monthly-overview', month, year],
    queryFn: () => api.get('/attendance/monthly-overview', { params: { month, year } }).then(r => r.data.data),
    enabled: isAdmin,
    refetchInterval: ATT_REFRESH,
  })

  const { data: teamAttendance, isLoading: teamLoading } = useQuery({
    queryKey: ['attendance-all', teamDate],
    queryFn: () => api.get('/attendance/all', { params: { date: teamDate } }).then(r => r.data.data),
    enabled: isAdmin,
    refetchInterval: ATT_REFRESH,
  })

  const { data: employees } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users', { params: { limit: 100 } }).then(r => r.data.data),
    enabled: isAdmin,
  })

  const { data: leaveBalance, isLoading: balanceLoading } = useQuery({
    queryKey: ['leave-balance'],
    queryFn: () => api.get('/leave/balance').then(r => r.data.data),
    refetchInterval: ATT_REFRESH,
  })

  const { data: myLeaves, isLoading: myLeavesLoading } = useQuery({
    queryKey: ['leave-my'],
    queryFn: () => api.get('/leave/my').then(r => r.data.data),
    refetchInterval: ATT_REFRESH,
  })

  const { data: allLeaves, isLoading: allLeavesLoading } = useQuery({
    queryKey: ['leave-all'],
    queryFn: () => api.get('/leave/all').then(r => r.data.data),
    enabled: isAdmin,
    refetchInterval: ATT_REFRESH,
  })

  const { data: reportRows, isLoading: reportLoading, refetch: refetchReport } = useQuery({
    queryKey: ['attendance-report', reportType, reportDate, reportMonth, reportYear],
    queryFn: () => api.get('/attendance/report', {
      params: { type: reportType, date: reportDate, month: reportMonth, year: reportYear },
    }).then(r => r.data.data),
    enabled: isAdmin,
  })

  // ---------- Mutations ----------
  const invalidateAttendance = () => {
    queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-my'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-dashboard-stats'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-trend'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-dept-wise'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-monthly-overview'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-all'] })
  }

  const clockInMutation = useMutation({
    mutationFn: (workFromHome) => api.post('/attendance/clock-in', { workFromHome }),
    onSuccess: () => { invalidateAttendance(); toast.success('Clocked in successfully!') },
  })
  const clockOutMutation = useMutation({
    mutationFn: () => api.post('/attendance/clock-out'),
    onSuccess: () => { invalidateAttendance(); toast.success('Clocked out successfully!') },
  })
  const breakStartMutation = useMutation({
    mutationFn: () => api.post('/attendance/break-start'),
    onSuccess: () => { invalidateAttendance(); toast.success('Break started') },
  })
  const breakEndMutation = useMutation({
    mutationFn: () => api.post('/attendance/break-end'),
    onSuccess: () => { invalidateAttendance(); toast.success('Break ended') },
  })

  const markMutation = useMutation({
    mutationFn: (payload) => api.post('/attendance/mark', payload),
    onSuccess: () => { invalidateAttendance(); setMarkOpen(false); toast.success('Attendance recorded') },
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/attendance/${id}`),
    onSuccess: () => { invalidateAttendance(); toast.success('Record deleted') },
  })

  const applyLeaveMutation = useMutation({
    mutationFn: (payload) => api.post('/leave', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-my'] })
      queryClient.invalidateQueries({ queryKey: ['leave-balance'] })
      setLeaveOpen(false)
      toast.success('Leave request submitted')
    },
  })
  const cancelLeaveMutation = useMutation({
    mutationFn: (id) => api.put(`/leave/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-my'] })
      queryClient.invalidateQueries({ queryKey: ['leave-all'] })
      queryClient.invalidateQueries({ queryKey: ['leave-balance'] })
      toast.success('Leave cancelled')
    },
  })
  const approveLeaveMutation = useMutation({
    mutationFn: (id) => api.put(`/leave/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-all'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-all'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-dashboard-stats'] })
      toast.success('Leave approved')
    },
  })
  const rejectLeaveMutation = useMutation({
    mutationFn: ({ id, rejectionReason }) => api.put(`/leave/${id}/reject`, { rejectionReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-all'] })
      setRejectTarget(null)
      setRejectReason('')
      toast.success('Leave rejected')
    },
  })

  const handleExport = async (fmt) => {
    try {
      const ext = fmt === 'excel' ? 'xls' : fmt
      await downloadBlob('/attendance/export', { type: reportType, date: reportDate, month: reportMonth, year: reportYear, format: fmt }, `attendance-${reportType}-report.${ext}`)
      toast.success(`Exported as ${fmt.toUpperCase()}`)
    } catch { toast.error('Export failed') }
  }

  const handleMarkSubmit = () => {
    if (!markForm.employee) { toast.error('Select an employee'); return }
    markMutation.mutate({
      employee: markForm.employee,
      date: markForm.date,
      status: markForm.status,
      clockIn: markForm.clockIn ? `${markForm.date}T${markForm.clockIn}:00` : undefined,
      clockOut: markForm.clockOut ? `${markForm.date}T${markForm.clockOut}:00` : undefined,
      notes: markForm.notes,
    })
  }

  // ---------- Derived ----------
  const presentDays = myAttendance?.filter(a => ['present', 'late', 'half_day', 'work_from_home'].includes(a.status)).length || 0
  const lateDays = myAttendance?.filter(a => a.isLate).length || 0
  const totalDays = myAttendance?.length || 0
  const myRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0
  const ongoingBreak = todayData?.breaks?.length && !todayData.breaks[todayData.breaks.length - 1].end
  const leaveDays = leaveForm.startDate && leaveForm.endDate
    ? Math.max(1, Math.round((new Date(leaveForm.endDate) - new Date(leaveForm.startDate)) / 86400000) + 1)
    : 0

  return (
    <div>
      <PageHeader title="Attendance & Leave" description="Track attendance, working hours, and manage leave requests" />

      <Tabs defaultValue={isAdmin ? 'overview' : 'my-attendance'}>
        <TabsList className="mb-6 flex-wrap h-auto">
          {isAdmin && <TabsTrigger value="overview">Overview</TabsTrigger>}
          <TabsTrigger value="my-attendance">My Attendance</TabsTrigger>
          {isAdmin && <TabsTrigger value="team">Team</TabsTrigger>}
          <TabsTrigger value="leave">Leave</TabsTrigger>
          {isAdmin && <TabsTrigger value="reports">Reports</TabsTrigger>}
        </TabsList>

        {isAdmin && (
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard title="Total Employees" value={statsLoading ? '—' : dashboardStats?.totalEmployees} icon={Users} color="blue" index={0} />
              <StatCard title="Present Today" value={statsLoading ? '—' : dashboardStats?.presentToday} icon={UserCheck} color="green" index={1} />
              <StatCard title="Absent Today" value={statsLoading ? '—' : dashboardStats?.absentToday} icon={UserX} color="red" index={2} />
              <StatCard title="Late Check-ins" value={statsLoading ? '—' : dashboardStats?.lateCheckins} icon={AlarmClock} color="orange" index={3} />
              <StatCard title="On Leave" value={statsLoading ? '—' : dashboardStats?.onLeaveToday} icon={CalendarOff} color="purple" index={4} />
              <StatCard title="Attendance Rate" value={statsLoading ? '—' : `${dashboardStats?.attendanceRate ?? 0}%`} icon={TrendingUp} color="indigo" index={5} />
            </div>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Attendance Trend (Last 14 Days)</CardTitle></CardHeader>
              <CardContent>
                {trendLoading ? <Skeleton className="h-64" /> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={trend || []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'MMM d')} tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip labelFormatter={(d) => format(parseISO(d), 'MMM d, yyyy')} />
                      <Legend />
                      <Area type="monotone" dataKey="present" name="Present" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.25} />
                      <Area type="monotone" dataKey="onLeave" name="On Leave" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} />
                      <Area type="monotone" dataKey="absent" name="Absent" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Department-wise Attendance</CardTitle></CardHeader>
                <CardContent>
                  {deptLoading ? <Skeleton className="h-56" /> : (deptWise || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                  ) : (
                    <div className="space-y-4">
                      {deptWise.map((d) => (
                        <div key={d.department}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">{d.department}</span>
                            <span className="text-muted-foreground">{d.present}/{d.total} ({d.rate}%)</span>
                          </div>
                          <Progress value={d.rate} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Monthly Attendance Overview</CardTitle></CardHeader>
                <CardContent>
                  {monthlyLoading ? <Skeleton className="h-56" /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={monthlyOverview || []}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'd')} tick={{ fontSize: 10 }} interval={2} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip labelFormatter={(d) => format(parseISO(d), 'MMM d, yyyy')} />
                        <Bar dataKey="present" name="Present" fill="#10b981" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="absent" name="Absent" fill="#ef4444" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        <TabsContent value="my-attendance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-1">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" />Today's Status</CardTitle></CardHeader>
              <CardContent>
                {todayLoading ? <Skeleton className="h-40" /> : (
                  <div className="text-center py-2">
                    <p className="text-3xl font-bold mb-1">{format(now, 'HH:mm')}</p>
                    <p className="text-sm text-muted-foreground mb-4">{format(now, 'EEEE, MMMM d')}</p>
                    {todayData?.clockIn ? (
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Clock in:</span>
                          <span className="font-medium">{fmtTime(todayData.clockIn)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Clock out:</span>
                          <span className="font-medium">{fmtTime(todayData.clockOut)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Break time:</span>
                          <span className="font-medium">{todayData.totalBreakMinutes || 0} min</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Hours worked:</span>
                          <span className="font-medium">{todayData.hoursWorked || 0}h</span>
                        </div>
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <Badge variant={STATUS_VARIANTS[todayData.status] || 'secondary'} className="capitalize">{statusLabel(todayData.status)}</Badge>
                          {todayData.isLate && <Badge variant="warning">Late by {todayData.lateMinutes}min</Badge>}
                          {todayData.overtimeHours > 0 && <Badge variant="purple">+{todayData.overtimeHours}h OT</Badge>}
                        </div>
                        {!todayData.clockOut ? (
                          <div className="space-y-2 pt-2">
                            {ongoingBreak ? (
                              <Button variant="secondary" className="w-full gap-2" onClick={() => breakEndMutation.mutate()} disabled={breakEndMutation.isPending}>
                                <Coffee className="w-4 h-4" />End Break
                              </Button>
                            ) : (
                              <Button variant="outline" className="w-full gap-2" onClick={() => breakStartMutation.mutate()} disabled={breakStartMutation.isPending}>
                                <Coffee className="w-4 h-4" />Start Break
                              </Button>
                            )}
                            <Button className="w-full gap-2" onClick={() => clockOutMutation.mutate()} disabled={clockOutMutation.isPending}>
                              <LogOut className="w-4 h-4" />Clock Out
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground pt-2">Day complete</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center gap-2">
                          <Switch checked={wfhToggle} onCheckedChange={setWfhToggle} id="wfh" />
                          <Label htmlFor="wfh" className="text-sm">Work From Home today</Label>
                        </div>
                        <Button className="w-full gap-2" onClick={() => clockInMutation.mutate(wfhToggle)} disabled={clockInMutation.isPending}>
                          <LogIn className="w-4 h-4" />Clock In
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4 content-start">
              {[
                { label: 'Present Days', value: presentDays, color: 'text-green-600' },
                { label: 'Late Days', value: lateDays, color: 'text-orange-500' },
                { label: 'Total Days', value: totalDays, color: 'text-blue-600' },
                { label: 'Attendance Rate', value: `${myRate}%`, color: myRate >= 90 ? 'text-green-600' : myRate >= 75 ? 'text-orange-500' : 'text-red-500' },
              ].map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="p-4 text-center">
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">My Attendance — {format(new Date(year, month - 1), 'MMMM yyyy')}</CardTitle></CardHeader>
            <CardContent>
              {historyLoading ? <Skeleton className="h-40" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['Date', 'Clock In', 'Clock Out', 'Break', 'Hours', 'Status'].map(h => (
                          <th key={h} className="text-left pb-2 font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {myAttendance?.length === 0 ? (
                        <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No attendance records</td></tr>
                      ) : myAttendance?.map((record) => (
                        <tr key={record._id} className="hover:bg-muted/30">
                          <td className="py-2">{format(new Date(record.date), 'EEE, MMM d')}</td>
                          <td className="py-2">{fmtTime(record.clockIn)}</td>
                          <td className="py-2">{fmtTime(record.clockOut)}</td>
                          <td className="py-2">{record.totalBreakMinutes ? `${record.totalBreakMinutes}m` : '—'}</td>
                          <td className="py-2">{record.hoursWorked ? `${record.hoursWorked}h` : '—'}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-1">
                              <Badge variant={STATUS_VARIANTS[record.status] || 'secondary'} className="capitalize text-xs">{statusLabel(record.status)}</Badge>
                              {record.isLate && <Badge variant="warning" className="text-xs">Late</Badge>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="team" className="space-y-6">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-3">
                <CardTitle className="text-base">Team Attendance</CardTitle>
                <div className="flex items-center gap-2">
                  <Input type="date" value={teamDate} onChange={(e) => setTeamDate(e.target.value)} className="w-40" />
                  <Button size="sm" className="gap-2" onClick={() => setMarkOpen(true)}>
                    <Plus className="w-4 h-4" />Mark Attendance
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {teamLoading ? <Skeleton className="h-64" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          {['Employee', 'Department', 'Clock In', 'Clock Out', 'Hours', 'Status', ''].map(h => (
                            <th key={h} className="text-left pb-2 font-medium text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {teamAttendance?.length === 0 ? (
                          <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No records for this date</td></tr>
                        ) : teamAttendance?.map((record) => (
                          <tr key={record._id} className="hover:bg-muted/30">
                            <td className="py-2 flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs text-primary font-medium">
                                {record.employee?.name?.charAt(0)}
                              </div>
                              {record.employee?.name}
                            </td>
                            <td className="py-2">{record.department || record.employee?.department || '—'}</td>
                            <td className="py-2">{fmtTime(record.clockIn)}</td>
                            <td className="py-2">{fmtTime(record.clockOut)}</td>
                            <td className="py-2">{record.hoursWorked ? `${record.hoursWorked}h` : '—'}</td>
                            <td className="py-2"><Badge variant={STATUS_VARIANTS[record.status] || 'secondary'} className="capitalize text-xs">{statusLabel(record.status)}</Badge></td>
                            <td className="py-2">
                              {['super_admin', 'admin'].includes(user?.role) && (
                                <button onClick={() => deleteMutation.mutate(record._id)} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="leave" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {balanceLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
            ) : (
              <>
                <Card><CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Casual Leave</p>
                  <p className="text-2xl font-bold mt-1">{leaveBalance?.casual?.balance ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{leaveBalance?.casual?.used ?? 0} used</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Sick Leave</p>
                  <p className="text-2xl font-bold mt-1">{leaveBalance?.sick?.balance ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{leaveBalance?.sick?.used ?? 0} used</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Earned Leave</p>
                  <p className="text-2xl font-bold mt-1">{leaveBalance?.earned?.balance ?? 0}</p>
                  <p className="text-xs text-muted-foreground">{leaveBalance?.earned?.used ?? 0} used</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Work From Home</p>
                  <p className="text-2xl font-bold mt-1">{leaveBalance?.workFromHome?.used ?? 0}</p>
                  <p className="text-xs text-muted-foreground">days taken</p>
                </CardContent></Card>
              </>
            )}
          </div>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">My Leave History</CardTitle>
              <Button size="sm" className="gap-2" onClick={() => setLeaveOpen(true)}><Plus className="w-4 h-4" />Apply Leave</Button>
            </CardHeader>
            <CardContent>
              {myLeavesLoading ? <Skeleton className="h-40" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border">{['Type', 'From', 'To', 'Days', 'Reason', 'Status', ''].map(h => <th key={h} className="text-left pb-2 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-border">
                      {myLeaves?.length === 0 ? (
                        <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No leave requests yet</td></tr>
                      ) : myLeaves?.map((lv) => (
                        <tr key={lv._id} className="hover:bg-muted/30">
                          <td className="py-2">{LEAVE_TYPE_LABELS[lv.leaveType]}</td>
                          <td className="py-2">{fmtDate(lv.startDate)}</td>
                          <td className="py-2">{fmtDate(lv.endDate)}</td>
                          <td className="py-2">{lv.totalDays}</td>
                          <td className="py-2 max-w-[200px] truncate">{lv.reason || '—'}</td>
                          <td className="py-2"><Badge variant={LEAVE_STATUS_VARIANTS[lv.status]} className="capitalize text-xs">{lv.status}</Badge></td>
                          <td className="py-2">
                            {lv.status === 'pending' && (
                              <button onClick={() => cancelLeaveMutation.mutate(lv._id)} className="text-xs text-muted-foreground hover:text-destructive">Cancel</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Leave Approvals</CardTitle></CardHeader>
              <CardContent>
                {allLeavesLoading ? <Skeleton className="h-40" /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border">{['Employee', 'Type', 'From', 'To', 'Days', 'Status', 'Actions'].map(h => <th key={h} className="text-left pb-2 font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-border">
                        {allLeaves?.length === 0 ? (
                          <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No leave requests</td></tr>
                        ) : allLeaves?.map((lv) => (
                          <tr key={lv._id} className="hover:bg-muted/30">
                            <td className="py-2">{lv.employee?.name}</td>
                            <td className="py-2">{LEAVE_TYPE_LABELS[lv.leaveType]}</td>
                            <td className="py-2">{fmtDate(lv.startDate)}</td>
                            <td className="py-2">{fmtDate(lv.endDate)}</td>
                            <td className="py-2">{lv.totalDays}</td>
                            <td className="py-2"><Badge variant={LEAVE_STATUS_VARIANTS[lv.status]} className="capitalize text-xs">{lv.status}</Badge></td>
                            <td className="py-2">
                              {lv.status === 'pending' && (
                                <div className="flex gap-2">
                                  <button onClick={() => approveLeaveMutation.mutate(lv._id)} className="text-green-600 hover:text-green-700">
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setRejectTarget(lv)} className="text-red-500 hover:text-red-600">
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Generate Report</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label className="text-xs mb-1 block">Report Type</Label>
                    <Select value={reportType} onValueChange={setReportType}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily Report</SelectItem>
                        <SelectItem value="weekly">Weekly Report</SelectItem>
                        <SelectItem value="monthly">Monthly Report</SelectItem>
                        <SelectItem value="employee-wise">Employee-wise Report</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(reportType === 'daily' || reportType === 'weekly') ? (
                    <div>
                      <Label className="text-xs mb-1 block">Date</Label>
                      <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-40" />
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label className="text-xs mb-1 block">Month</Label>
                        <Select value={String(reportMonth)} onValueChange={(v) => setReportMonth(parseInt(v))}>
                          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1 block">Year</Label>
                        <Input type="number" value={reportYear} onChange={(e) => setReportYear(parseInt(e.target.value) || now.getFullYear())} className="w-24" />
                      </div>
                    </>
                  )}
                  <Button variant="outline" className="gap-2" onClick={() => refetchReport()}>
                    <FileSpreadsheet className="w-4 h-4" />Preview
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" className="gap-2" onClick={() => handleExport('csv')}><FileText className="w-4 h-4" />Export CSV</Button>
                  <Button size="sm" variant="secondary" className="gap-2" onClick={() => handleExport('excel')}><FileSpreadsheet className="w-4 h-4" />Export Excel</Button>
                  <Button size="sm" variant="secondary" className="gap-2" onClick={() => handleExport('pdf')}><FileDown className="w-4 h-4" />Export PDF</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Report Preview ({reportRows?.length || 0} records)</CardTitle></CardHeader>
              <CardContent>
                {reportLoading ? <Skeleton className="h-64" /> : (
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border sticky top-0 bg-card">{['Employee', 'ID', 'Department', 'Date', 'In', 'Out', 'Hours', 'OT', 'Status', 'Remarks'].map(h => <th key={h} className="text-left pb-2 font-medium text-muted-foreground whitespace-nowrap pr-3">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-border">
                        {(!reportRows || reportRows.length === 0) ? (
                          <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">No records found</td></tr>
                        ) : reportRows.map((row, i) => (
                          <tr key={i} className="hover:bg-muted/30">
                            <td className="py-2 pr-3 whitespace-nowrap">{row.employeeName}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{row.employeeId}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{row.department}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{row.date}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{row.checkIn}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{row.checkOut}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{row.hoursWorked}</td>
                            <td className="py-2 pr-3 whitespace-nowrap">{row.overtimeHours}</td>
                            <td className="py-2 pr-3 whitespace-nowrap"><Badge variant={STATUS_VARIANTS[row.status] || 'secondary'} className="capitalize text-xs">{statusLabel(row.status)}</Badge></td>
                            <td className="py-2 pr-3 whitespace-nowrap max-w-[160px] truncate">{row.remarks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Mark Attendance Dialog */}
      <Dialog open={markOpen} onOpenChange={setMarkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark Attendance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">Employee</Label>
              <Select value={markForm.employee} onValueChange={(v) => setMarkForm(f => ({ ...f, employee: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees?.map((e) => <SelectItem key={e._id} value={e._id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Date</Label>
                <Input type="date" value={markForm.date} onChange={(e) => setMarkForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Status</Label>
                <Select value={markForm.status} onValueChange={(v) => setMarkForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(STATUS_VARIANTS).map((s) => <SelectItem key={s} value={s} className="capitalize">{statusLabel(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Clock In</Label>
                <Input type="time" value={markForm.clockIn} onChange={(e) => setMarkForm(f => ({ ...f, clockIn: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Clock Out</Label>
                <Input type="time" value={markForm.clockOut} onChange={(e) => setMarkForm(f => ({ ...f, clockOut: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Remarks</Label>
              <textarea
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                value={markForm.notes}
                onChange={(e) => setMarkForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkOpen(false)}>Cancel</Button>
            <Button onClick={handleMarkSubmit} disabled={markMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Leave Dialog */}
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">Leave Type</Label>
              <Select value={leaveForm.leaveType} onValueChange={(v) => setLeaveForm(f => ({ ...f, leaveType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPE_LABELS).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Start Date</Label>
                <Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">End Date</Label>
                <Input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Reason</Label>
              <textarea
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={3}
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            {leaveDays > 0 && <p className="text-xs text-muted-foreground">Total: {leaveDays} day(s)</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Cancel</Button>
            <Button onClick={() => applyLeaveMutation.mutate(leaveForm)} disabled={applyLeaveMutation.isPending}>Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Leave Dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Leave Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Rejecting {rejectTarget?.employee?.name}'s {rejectTarget ? LEAVE_TYPE_LABELS[rejectTarget.leaveType] : ''} request.
            </p>
            <div>
              <Label className="text-xs mb-1 block">Reason (optional)</Label>
              <textarea
                className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectLeaveMutation.mutate({ id: rejectTarget._id, rejectionReason: rejectReason })} disabled={rejectLeaveMutation.isPending}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
