/**
 * integrationConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Data-driven configuration for all supported integrations.
 * Adding a new integration = adding one entry to INTEGRATIONS array.
 * No changes needed in the hub UI components.
 */

export const INTEGRATION_CATEGORIES = [
  { key: 'all',           label: 'All',           emoji: '🔌' },
  { key: 'marketing',     label: 'Marketing',     emoji: '📢' },
  { key: 'communication', label: 'Communication', emoji: '💬' },
  { key: 'google',        label: 'Google',        emoji: '🔍' },
  { key: 'payments',      label: 'Payments',      emoji: '💳' },
  { key: 'ai',            label: 'AI',            emoji: '🤖' },
  { key: 'developer',     label: 'Developer',     emoji: '🔧' },
]

/**
 * Field types:
 *  text     — plain text input
 *  password — masked input (never shown in full)
 *  select   — dropdown
 *  toggle   — boolean switch
 *  textarea — multiline text
 *  readonly — display-only (shown from config, not editable)
 */
export const INTEGRATIONS = [
  // ── MARKETING ──────────────────────────────────────────────────────────────
  {
    id: 'meta_ads',
    category: 'marketing',
    name: 'Meta Ads',
    description: 'Connect Facebook & Instagram advertising accounts to sync leads and campaign data.',
    icon: '🔵',
    color: '#1877F2',
    authType: 'oauth', // also supports manual
    oauthLabel: 'Connect with Meta',
    syncIntervalMinutes: 15,
    syncLabel: 'Every 15 minutes',
    supportsWebhook: true,
    fields: [
      { key: 'accessToken',    label: 'Access Token',         type: 'password',  required: true,  placeholder: 'EAAxxxxxxxx…' },
      { key: 'adAccountId',    label: 'Ad Account ID',        type: 'text',      required: true,  placeholder: 'act_1234567890' },
      { key: 'pageId',         label: 'Facebook Page ID',     type: 'text',      required: false, placeholder: '1234567890' },
      { key: 'instagramAccountId', label: 'Instagram Account ID', type: 'text', required: false, placeholder: '1234567890' },
      { key: 'pixelId',        label: 'Pixel ID (optional)',  type: 'text',      required: false, placeholder: '1234567890' },
    ],
    configFields: [
      { key: 'businessName', label: 'Business Name' },
      { key: 'adAccountName', label: 'Ad Account' },
    ],
    displayFields: ['businessName', 'adAccountName'],
  },

  // ── COMMUNICATION ──────────────────────────────────────────────────────────
  {
    id: 'whatsapp',
    category: 'communication',
    name: 'WhatsApp Business',
    description: 'Connect WhatsApp Business Cloud API for messaging and lead communication.',
    icon: '🟢',
    color: '#25D366',
    authType: 'manual',
    syncIntervalMinutes: 0, // realtime webhook
    syncLabel: 'Realtime via Webhook',
    supportsWebhook: true,
    supportsTestConnection: true,
    fields: [
      { key: 'accessToken',        label: 'Access Token',           type: 'password', required: true,  placeholder: 'EAAxxxxxxxx…' },
      { key: 'webhookVerifyToken', label: 'Webhook Verify Token',   type: 'password', required: true,  placeholder: 'my_verify_token' },
    ],
    configFields: [
      { key: 'businessAccountId', label: 'Business Account ID',     type: 'text', required: true, placeholder: '1234567890' },
      { key: 'phoneNumberId',     label: 'Phone Number ID',         type: 'text', required: true, placeholder: '1234567890' },
      { key: 'displayPhone',      label: 'Connected Phone Number',  type: 'text', required: false },
    ],
    displayFields: ['displayPhone', 'businessAccountId'],
  },

  // ── GOOGLE ─────────────────────────────────────────────────────────────────
  {
    id: 'google',
    category: 'google',
    name: 'Google Workspace',
    description: 'Connect Google Calendar, Drive, Gmail, Analytics, and Looker Studio.',
    icon: '🔴',
    color: '#4285F4',
    authType: 'oauth',
    oauthLabel: 'Connect with Google',
    syncIntervalMinutes: 30,
    syncLabel: 'Every 30 minutes',
    supportsWebhook: false,
    fields: [
      { key: 'accessToken',  label: 'Access Token',  type: 'password', required: true },
      { key: 'refreshToken', label: 'Refresh Token', type: 'password', required: false },
    ],
    configFields: [
      { key: 'connectedEmail', label: 'Connected Email' },
      { key: 'connectedName',  label: 'Account Name' },
    ],
    displayFields: ['connectedEmail'],
    services: ['Google Calendar', 'Google Drive', 'Gmail', 'Google Analytics', 'Looker Studio'],
  },

  // ── PAYMENTS ───────────────────────────────────────────────────────────────
  {
    id: 'razorpay',
    category: 'payments',
    name: 'Razorpay',
    description: 'Connect Razorpay to track payments, subscriptions, and invoices.',
    icon: '💙',
    color: '#3395FF',
    authType: 'api_key',
    syncIntervalMinutes: 0,
    syncLabel: 'Instant Webhook',
    supportsWebhook: true,
    supportsTestConnection: true,
    fields: [
      { key: 'keySecret',     label: 'Key Secret',      type: 'password', required: true,  placeholder: 'rzp_live_xxxxxxxx' },
      { key: 'webhookSecret', label: 'Webhook Secret',  type: 'password', required: false, placeholder: 'webhook_secret' },
    ],
    configFields: [
      { key: 'keyId', label: 'Key ID', type: 'text', required: true, placeholder: 'rzp_live_xxxxxxxx' },
    ],
    displayFields: ['keyId'],
  },
  {
    id: 'stripe',
    category: 'payments',
    name: 'Stripe',
    description: 'Connect Stripe for payment processing, subscriptions, and revenue tracking.',
    icon: '🟣',
    color: '#6772E5',
    authType: 'api_key',
    syncIntervalMinutes: 0,
    syncLabel: 'Instant Webhook',
    supportsWebhook: true,
    supportsTestConnection: true,
    fields: [
      { key: 'secretKey',     label: 'Secret Key',      type: 'password', required: true,  placeholder: 'sk_live_xxxxxxxx' },
      { key: 'webhookSecret', label: 'Webhook Secret',  type: 'password', required: false, placeholder: 'whsec_xxxxxxxx' },
    ],
    configFields: [
      { key: 'publishableKey', label: 'Publishable Key', type: 'text', required: false, placeholder: 'pk_live_xxxxxxxx' },
    ],
    displayFields: ['publishableKey'],
  },
  {
    id: 'paypal',
    category: 'payments',
    name: 'PayPal',
    description: 'Connect PayPal for payment and subscription management.',
    icon: '🔵',
    color: '#003087',
    authType: 'api_key',
    syncIntervalMinutes: 0,
    syncLabel: 'Instant Webhook',
    supportsWebhook: true,
    fields: [
      { key: 'clientSecret',  label: 'Client Secret',   type: 'password', required: true,  placeholder: 'ExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXxxxxxx' },
      { key: 'webhookSecret', label: 'Webhook ID',      type: 'password', required: false },
    ],
    configFields: [
      { key: 'clientId', label: 'Client ID', type: 'text', required: true, placeholder: 'AxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXxxxxxx' },
      { key: 'mode',     label: 'Mode',      type: 'select', options: ['sandbox', 'live'], required: true },
    ],
    displayFields: ['clientId', 'mode'],
  },

  // ── AI ─────────────────────────────────────────────────────────────────────
  {
    id: 'openai',
    category: 'ai',
    name: 'OpenAI',
    description: 'Connect OpenAI API for GPT-powered automation, summaries, and lead scoring.',
    icon: '⚫',
    color: '#10a37f',
    authType: 'api_key',
    syncIntervalMinutes: null,
    syncLabel: 'On demand',
    supportsTestConnection: true,
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
    configFields: [
      {
        key: 'defaultModel',
        label: 'Default Model',
        type: 'select',
        options: ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
        required: false,
        defaultValue: 'gpt-4o',
      },
      { key: 'monthlyTokenLimit', label: 'Monthly Token Limit', type: 'text', required: false, placeholder: '1000000' },
    ],
    displayFields: ['defaultModel'],
  },
  {
    id: 'claude',
    category: 'ai',
    name: 'Anthropic Claude',
    description: 'Connect Claude API for advanced AI reasoning, analysis, and content generation.',
    icon: '🟠',
    color: '#D97706',
    authType: 'api_key',
    syncIntervalMinutes: null,
    syncLabel: 'On demand',
    supportsTestConnection: true,
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-ant-xxxxxxxx' },
    ],
    configFields: [
      {
        key: 'defaultModel',
        label: 'Default Model',
        type: 'select',
        options: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
        required: false,
        defaultValue: 'claude-sonnet-4-6',
      },
      { key: 'monthlyTokenLimit', label: 'Monthly Token Limit', type: 'text', required: false, placeholder: '1000000' },
    ],
    displayFields: ['defaultModel'],
  },
  {
    id: 'gemini',
    category: 'ai',
    name: 'Google Gemini',
    description: 'Connect Gemini API for multimodal AI capabilities.',
    icon: '🌟',
    color: '#4285F4',
    authType: 'api_key',
    syncIntervalMinutes: null,
    syncLabel: 'On demand',
    supportsTestConnection: true,
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'AIzaxxxxxxxx' },
    ],
    configFields: [
      {
        key: 'defaultModel',
        label: 'Default Model',
        type: 'select',
        options: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
        required: false,
        defaultValue: 'gemini-1.5-pro',
      },
    ],
    displayFields: ['defaultModel'],
  },

  // ── DEVELOPER ──────────────────────────────────────────────────────────────
  {
    id: 'webhook',
    category: 'developer',
    name: 'Webhooks',
    description: 'Configure incoming and outgoing webhooks for custom integrations and automation.',
    icon: '🔗',
    color: '#6366F1',
    authType: 'webhook',
    syncIntervalMinutes: null,
    syncLabel: 'Realtime',
    supportsWebhook: true,
    supportsTestConnection: true,
    fields: [
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', required: false, placeholder: 'whsec_xxxxxxxx', hint: 'Used to verify incoming webhook signatures' },
      { key: 'authToken',     label: 'Auth Token (Outgoing)', type: 'password', required: false, placeholder: 'Bearer token for outgoing requests' },
    ],
    configFields: [
      { key: 'webhookUrl',   label: 'Incoming Webhook URL', type: 'text', required: false, placeholder: 'https://your-server.com/webhook' },
      { key: 'outgoingUrl',  label: 'Outgoing Webhook URL', type: 'text', required: false, placeholder: 'https://your-endpoint.com/receive' },
    ],
    displayFields: ['webhookUrl'],
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

export const getIntegrationById = (id) => INTEGRATIONS.find(i => i.id === id)

export const getIntegrationsByCategory = (category) =>
  category === 'all' ? INTEGRATIONS : INTEGRATIONS.filter(i => i.category === category)

export const STATUS_CONFIG = {
  connected:    { label: 'Connected',    variant: 'success' },
  disconnected: { label: 'Disconnected', variant: 'secondary' },
  pending:      { label: 'Pending',      variant: 'info' },
  expired:      { label: 'Expired',      variant: 'warning' },
  failed:       { label: 'Failed',       variant: 'destructive' },
  sync_error:   { label: 'Sync Error',   variant: 'warning' },
}
