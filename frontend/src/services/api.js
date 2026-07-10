import axios from 'axios'
import toast from 'react-hot-toast'

const TOKEN_KEY = 'crm_token'

export const saveToken  = (token) => localStorage.setItem(TOKEN_KEY, token)
export const getToken   = ()      => localStorage.getItem(TOKEN_KEY)
export const clearToken = ()      => localStorage.removeItem(TOKEN_KEY)

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// ── Attach stored token on every request ──────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Global response error handler ─────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || 'Something went wrong'
    const status  = error.response?.status
    const url     = error.config?.url || ''

    if (status === 401) {
      // /auth/me is called on every page load to check session.
      // Let AuthContext handle its 401 silently — don't force-redirect here.
      const isAuthCheck = url.includes('/auth/me')
      if (!isAuthCheck && window.location.pathname !== '/login') {
        clearToken()
        window.location.href = '/login'
      }
    } else if (status !== 404) {
      toast.error(message)
    }

    return Promise.reject(error)
  }
)

export default api
