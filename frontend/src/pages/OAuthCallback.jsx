import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * OAuthCallback — /oauth-callback
 *
 * The backend redirects the OAuth popup to this page after token exchange.
 * This page reads the URL params, sends a postMessage to window.opener
 * (the Integrations Hub tab/window), then closes itself.
 *
 * URL params:
 *   status   — "success" | "error"
 *   provider — e.g. "meta_ads", "google"
 *   reason   — error reason (optional)
 */
export default function OAuthCallback() {
  const [params] = useSearchParams()

  useEffect(() => {
    const status   = params.get('status')
    const provider = params.get('provider')
    const reason   = params.get('reason')

    const message = {
      type:     'oauth_complete',
      provider,
      success:  status === 'success',
      reason:   reason || null,
    }

    // Send result to parent window
    if (window.opener) {
      window.opener.postMessage(message, window.location.origin)
    }

    // Auto-close after a short delay so the user sees the message
    const timer = setTimeout(() => {
      window.close()
    }, 1000)

    return () => clearTimeout(timer)
  }, []) // eslint-disable-line

  const status = params.get('status')

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3 p-8">
        {status === 'success' ? (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-base">Connected successfully</p>
            <p className="text-sm text-muted-foreground">This window will close automatically…</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="font-semibold text-base">Connection failed</p>
            <p className="text-sm text-muted-foreground">
              {params.get('reason') ? decodeURIComponent(params.get('reason')) : 'Please try again.'}
            </p>
            <p className="text-xs text-muted-foreground">This window will close automatically…</p>
          </>
        )}
      </div>
    </div>
  )
}
