/**
 * portalApi.js
 * Axios instance for Client Portal — uses portalToken from localStorage.
 * Completely separate from the main CRM api.js.
 */
import axios from 'axios'

const portalApi = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api/portal`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

portalApi.interceptors.request.use(config => {
  const token = localStorage.getItem('portalToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

portalApi.interceptors.response.use(
  r => r,
  err => {
    // If 401, clear portal token so PortalRoute redirects to login
    if (err.response?.status === 401) {
      localStorage.removeItem('portalToken')
      localStorage.removeItem('portalUser')
    }
    return Promise.reject(err)
  }
)

export default portalApi
