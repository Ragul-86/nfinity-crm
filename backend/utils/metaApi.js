const https = require('https')

const META_API_VERSION = 'v19.0'
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`

/**
 * Make a GET request to Meta Graph API
 */
function metaGet(endpoint, params = {}) {
  params.access_token = process.env.META_PAGE_ACCESS_TOKEN
  const query = new URLSearchParams(params).toString()
  const url = `${META_BASE}/${endpoint}?${query}`

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.error) reject(new Error(parsed.error.message))
          else resolve(parsed)
        } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

/**
 * Parse Meta lead field_data array into our model fields
 */
function parseMetaLeadFields(fieldData = []) {
  const map = {}
  fieldData.forEach(f => { map[f.name] = f.values?.[0] || '' })
  return {
    fullName: map.full_name || map.name || map.first_name
      ? `${map.first_name || ''} ${map.last_name || ''}`.trim() || map.full_name || map.name || 'Unknown'
      : map.full_name || map.name || 'Unknown',
    phone: map.phone_number || map.phone || '',
    email: map.email || '',
  }
}

/**
 * Fetch a single lead's data from Meta using leadId
 */
async function fetchMetaLead(leadId) {
  const data = await metaGet(leadId, {
    fields: 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,platform',
  })
  const { fullName, phone, email } = parseMetaLeadFields(data.field_data)
  return {
    metaLeadId: data.id,
    formId: data.form_id,
    adId: data.ad_id,
    adSetId: data.adset_id,
    campaignId: data.campaign_id,
    fullName,
    phone,
    email,
    campaignName: data.campaign_name || '',
    adSetName: data.adset_name || '',
    adName: data.ad_name || '',
    platform: data.platform === 'ig' ? 'instagram' : data.platform === 'fb' ? 'facebook' : 'unknown',
    receivedAt: data.created_time ? new Date(data.created_time) : new Date(),
    rawData: data,
  }
}

/**
 * Fetch leads from a specific form
 */
async function fetchFormLeads(formId, after = null) {
  const params = {
    fields: 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,field_data,platform',
    limit: 100,
  }
  if (after) params.after = after
  return metaGet(`${formId}/leads`, params)
}

/**
 * Fetch all forms for a page
 */
async function fetchPageForms(pageId) {
  return metaGet(`${pageId}/leadgen_forms`, {
    fields: 'id,name,status',
  })
}

/**
 * Verify Meta webhook signature
 */
function verifyWebhookSignature(payload, signature) {
  const crypto = require('crypto')
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) return false
  const expected = crypto.createHmac('sha256', appSecret).update(payload).digest('hex')
  return signature === `sha256=${expected}`
}

module.exports = { fetchMetaLead, fetchFormLeads, fetchPageForms, parseMetaLeadFields, verifyWebhookSignature }
