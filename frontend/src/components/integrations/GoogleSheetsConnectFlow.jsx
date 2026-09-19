/**
 * GoogleSheetsConnectFlow.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Two-step connect flow for the google_sheets integration:
 *   Step 1 — OAuth popup (drive.file scope, openid email profile)
 *   Step 2 — Google Picker (browser-side file picker, Sheets only)
 *   Step 3 — Tab selection + save
 *
 * Design constraints:
 *  • GOOGLE_CLIENT_SECRET is never sent to the browser.
 *  • access_token is fetched from the backend only when the Picker needs it.
 *  • tenantId is never accepted from the browser — always from JWT middleware.
 *  • Existing Leads are never overwritten; dedup is handled server-side.
 */

import React, { useState, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FolderOpen, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/services/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cn } from '@/utils/cn'

// ── Load Google API script + Picker module ───────────────────────────────────
function loadGapiPicker() {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) { resolve(); return }

    const doLoad = () => window.gapi.load('picker', { callback: resolve, onerror: reject })

    if (window.gapi) { doLoad(); return }

    if (document.getElementById('gapi-script')) {
      // Script tag exists but gapi not ready yet — wait
      const poll = setInterval(() => {
        if (window.gapi) { clearInterval(poll); doLoad() }
      }, 100)
      setTimeout(() => { clearInterval(poll); reject(new Error('Google API load timeout')) }, 10_000)
      return
    }

    const script = document.createElement('script')
    script.id    = 'gapi-script'
    script.src   = 'https://apis.google.com/js/api.js'
    script.async = true
    script.defer = true
    script.onload  = doLoad
    script.onerror = () => reject(new Error('Failed to load Google API script'))
    document.head.appendChild(script)
  })
}

// ── Step indicator ───────────────────────────────────────────────────────────
function StepDot({ n, label, active, done }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
        done  ? 'bg-emerald-500 text-white'
              : active ? 'bg-primary text-primary-foreground'
                       : 'bg-muted text-muted-foreground'
      )}>
        {done ? '✓' : n}
      </div>
      <span className={cn('text-xs', active ? 'font-medium' : 'text-muted-foreground')}>{label}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GoogleSheetsConnectFlow({ open, onClose, integration }) {
  const qc = useQueryClient()

  const isAlreadyConnected = integration?.status === 'connected'
  const hasSheet           = !!(integration?.config?.spreadsheetId)

  // When already connected + has a sheet → start at picker step (allow changing)
  // When connected but no sheet → picker step
  // When not connected → oauth step
  const initialStep = isAlreadyConnected ? 'picker' : 'oauth'

  const [step,          setStep]          = useState(initialStep)
  const [loading,       setLoading]       = useState(false)
  const [spreadsheetId, setSpreadsheetId] = useState(integration?.config?.spreadsheetId || '')
  const [selectedFile,  setSelectedFile]  = useState(integration?.config?.selectedFileName || '')
  const [availableSheets, setAvailableSheets] = useState([])
  const [sheetName,     setSheetName]     = useState(integration?.config?.sheetName || '')
  const [verifyError,   setVerifyError]   = useState('')

  // Reset when modal opens/integration changes
  useEffect(() => {
    if (open) {
      setStep(isAlreadyConnected ? 'picker' : 'oauth')
      setSpreadsheetId(integration?.config?.spreadsheetId || '')
      setSelectedFile(integration?.config?.selectedFileName || '')
      setSheetName(integration?.config?.sheetName || '')
      setAvailableSheets([])
      setVerifyError('')
      setLoading(false)
    }
  }, [open, isAlreadyConnected]) // eslint-disable-line

  // ── Save config mutation ──────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (body) => api.post('/integrations/google_sheets/config', body).then(r => r.data),
    onSuccess: () => {
      toast.success('Google Sheet connected successfully')
      qc.invalidateQueries(['integrations'])
      onClose()
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save sheet configuration'),
  })

  // ── Step 1: OAuth popup ───────────────────────────────────────────────────
  const handleOAuth = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/integrations/oauth/google_sheets/init?noRedirect=true')
      const authUrl  = data.authUrl
      if (!authUrl) throw new Error('No auth URL returned from server')

      const width = 600, height = 700
      const left  = Math.round((window.screen.width  - width)  / 2)
      const top   = Math.round((window.screen.height - height) / 2)
      const popup = window.open(
        authUrl,
        'oauth_google_sheets',
        `width=${width},height=${height},left=${left},top=${top},toolbar=0,menubar=0,status=0`
      )

      const handler = (event) => {
        if (event.origin !== window.location.origin) return
        if (event.data?.type !== 'oauth_complete') return
        if (event.data?.provider !== 'google_sheets') return

        window.removeEventListener('message', handler)
        clearInterval(closedPoll)
        setLoading(false)

        if (event.data.success) {
          // OAuth done — advance to Picker step
          qc.invalidateQueries(['integrations'])
          setStep('picker')
        } else {
          toast.error(`OAuth failed: ${event.data.reason || 'Unknown error'}`)
        }
      }
      window.addEventListener('message', handler)

      // Fallback: detect popup closed without postMessage
      const closedPoll = setInterval(() => {
        if (popup?.closed) {
          clearInterval(closedPoll)
          window.removeEventListener('message', handler)
          setLoading(false)
          // Refetch to pick up any connection changes
          qc.invalidateQueries(['integrations'])
        }
      }, 600)

    } catch (e) {
      setLoading(false)
      toast.error(e?.response?.data?.message || e?.message || 'Failed to start Google OAuth')
    }
  }, [qc])

  // ── Step 2: Open Google Picker ────────────────────────────────────────────
  // pickerRef keeps the Picker instance alive while open so it is not GC'd
  const pickerRef = React.useRef(null)

  const handleOpenPicker = useCallback(async () => {
    setLoading(true)
    setVerifyError('')
    try {
      // Fetch token + keys from the backend (never GOOGLE_CLIENT_SECRET)
      const { data } = await api.get('/integrations/google_sheets/picker-config')
      const { accessToken, apiKey } = data

      // Load gapi.picker if not already loaded
      await loadGapiPicker()

      const google = window.google

      const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
        .setMimeTypes('application/vnd.google-apps.spreadsheet')
        .setSelectFolderEnabled(false)

      const pickerBuilder = new google.picker.PickerBuilder()
        .setTitle('Select a Google Sheet')
        .setOAuthToken(accessToken)
        .addView(view)
        .setCallback((pickerData) => {
          // NOTE: callback must be synchronous — Picker does not await Promises
          try {
            const action = pickerData[google.picker.Response.ACTION]

            if (action === google.picker.Action.PICKED) {
              const docs = pickerData[google.picker.Response.DOCUMENTS]

              if (!docs || docs.length === 0) {
                setLoading(false)
                toast.error('Google Picker returned no file. Please try again.')
                return
              }

              const doc      = docs[0]
              const fileId   = doc[google.picker.Document.ID]
              const fileName = doc[google.picker.Document.NAME]

              if (!fileId) {
                setLoading(false)
                toast.error('Could not read the selected file ID. Please try again.')
                return
              }

              handleFilePicked(fileId, fileName)
            } else if (action === google.picker.Action.CANCEL) {
              setLoading(false)
            }
            // other actions (e.g. 'loaded') are silently ignored
          } catch (cbErr) {
            // Catch synchronous errors — they would otherwise be silently lost
            setLoading(false)
            toast.error('Picker error: ' + (cbErr?.message || String(cbErr)))
          }
        })

      if (apiKey) pickerBuilder.setDeveloperKey(apiKey)

      const picker = pickerBuilder.build()
      pickerRef.current = picker   // keep alive while open
      picker.setVisible(true)

      // setLoading(false) is handled inside handleFilePicked or on cancel/error above
    } catch (e) {
      setLoading(false)
      const msg = e?.response?.data?.message || e?.message || 'Failed to open Google Picker'
      if (e?.response?.status === 401) {
        toast.error('Session expired. Please reconnect Google Sheets.')
        setStep('oauth')
      } else {
        toast.error(msg)
      }
    }
  }, []) // eslint-disable-line

  // Called by Picker callback after user picks a file
  const handleFilePicked = useCallback(async (fileId, fileName) => {
    setLoading(true)
    setVerifyError('')
    try {
      const { data } = await api.post('/integrations/google_sheets/config/verify', { spreadsheetId: fileId })
      setSpreadsheetId(fileId)
      setSelectedFile(data.fileName || fileName)
      setAvailableSheets(data.availableSheets || [])
      setSheetName(data.availableSheets?.[0] || '')
      setStep('tab')
    } catch (e) {
      const errMsg = e?.response?.data?.message || e?.message || 'Could not verify sheet access.'
      setVerifyError(errMsg)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Step 3: Save config ───────────────────────────────────────────────────
  const handleSave = () => {
    if (!sheetName) { toast.error('Please select a sheet tab'); return }
    saveMutation.mutate({ spreadsheetId, sheetName, selectedFileName: selectedFile })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-md flex items-center justify-center text-base"
                  style={{ backgroundColor: '#0F9D5818', border: '1px solid #0F9D5830' }}>
              📗
            </span>
            {isAlreadyConnected ? 'Update Google Sheet' : 'Connect Google Sheets'}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-3 py-1">
          <StepDot n={1} label="Authorize"   active={step === 'oauth'}   done={step !== 'oauth'} />
          <div className="flex-1 h-px bg-border" />
          <StepDot n={2} label="Select Sheet" active={step === 'picker'}  done={step === 'tab'} />
          <div className="flex-1 h-px bg-border" />
          <StepDot n={3} label="Choose Tab"   active={step === 'tab'}    done={false} />
        </div>

        {/* ── Step 1: OAuth ───────────────────────────────────────────────── */}
        {step === 'oauth' && (
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sign in with Google to authorize CRM access to files you explicitly select.
              Only the specific sheet you choose will be accessible — no access to the rest of your Drive.
            </p>
            <Button
              className="w-full gap-2"
              onClick={handleOAuth}
              disabled={loading}
            >
              <ExternalLink className="w-4 h-4" />
              {loading ? 'Opening Google…' : 'Connect with Google'}
            </Button>
          </div>
        )}

        {/* ── Step 2: Picker ──────────────────────────────────────────────── */}
        {step === 'picker' && (
          <div className="space-y-4 pt-1">
            {isAlreadyConnected && integration?.config?.connectedEmail && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                Authorized as {integration.config.connectedEmail}
              </div>
            )}
            {hasSheet && (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 border border-border">
                Current: <span className="font-medium text-foreground">{integration.config.selectedFileName}</span>
                {integration.config.sheetName && <> · tab <span className="font-medium text-foreground">{integration.config.sheetName}</span></>}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Click below to open the Google file picker and select the Google Sheet containing your leads.
            </p>
            {verifyError && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {verifyError}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Button
                className="w-full gap-2"
                onClick={handleOpenPicker}
                disabled={loading}
              >
                <FolderOpen className="w-4 h-4" />
                {loading ? 'Opening Picker…' : hasSheet ? 'Change Google Sheet' : 'Select Google Sheet'}
              </Button>
              {/* Allow re-OAuth if token expired */}
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setStep('oauth')}>
                Sign in with a different Google account
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Tab selection ────────────────────────────────────────── */}
        {step === 'tab' && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Selected: <span className="font-medium ml-1">{selectedFile}</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Sheet Tab</label>
              <p className="text-xs text-muted-foreground">Choose which tab contains your lead data.</p>
              {availableSheets.length > 0 ? (
                <Select value={sheetName} onValueChange={setSheetName}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a tab…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSheets.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-xs text-muted-foreground bg-muted/40 border border-border rounded-md px-3 py-2">
                  No tabs found — the sheet may be empty.
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setStep('picker')}>
                Back
              </Button>
              <Button
                className="flex-1 gap-1.5"
                onClick={handleSave}
                disabled={saveMutation.isPending || !sheetName}
              >
                <RefreshCw className={cn('w-3.5 h-3.5', saveMutation.isPending && 'animate-spin')} />
                {saveMutation.isPending ? 'Saving…' : 'Save & Connect'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
