/**
 * usePDFDownload
 * Opens a browser print window (Save as PDF) for invoice/quotation documents.
 * No npm dependencies — pure JS, no JSX.
 */
import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'

function rupees(n) {
  if (!n && n !== 0) return '₹0.00'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return String(d) }
}

function buildPrintHTML(doc, type, companyInfo) {
  const isInvoice = type === 'invoice'
  const title     = isInvoice ? 'TAX INVOICE' : 'QUOTATION'
  const docNo     = isInvoice ? (doc.invoiceNumber || '—') : (doc.quoteNumber || '—')
  const dateLabel = isInvoice ? 'Invoice Date' : 'Quote Date'
  const docDate   = fmtDate(isInvoice ? doc.invoiceDate : doc.quoteDate)
  const dueLabel  = isInvoice ? 'Due Date' : 'Valid Until'
  const dueDate   = fmtDate(isInvoice ? doc.dueDate : doc.validUntil)

  const company = {
    name:    companyInfo.name    || 'Your Company Name',
    address: companyInfo.address || '',
    phone:   companyInfo.phone   || '',
    email:   companyInfo.email   || '',
    gstin:   companyInfo.gstin   || '',
  }

  const client = doc.client || {}

  const items = (doc.items || []).map(item => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${item.description || ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.qty || 1}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${rupees(item.unitPrice)}</td>
      ${doc.gstEnabled ? `<td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.gstRate || 0}%</td>` : ''}
      <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:500;">${rupees(item.total)}</td>
    </tr>`).join('')

  const gstCol = doc.gstEnabled ? '<th style="padding:8px 10px;text-align:center;background:#f3f4f6;border-bottom:2px solid #d1d5db;">GST%</th>' : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${title} ${docNo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #111; background: #fff; padding: 24px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 3px solid #6366f1; padding-bottom: 16px; }
    .company-name { font-size: 22px; font-weight: 700; color: #6366f1; margin-bottom: 4px; }
    .company-meta { font-size: 11px; color: #555; line-height: 1.7; }
    .doc-title { font-size: 28px; font-weight: 800; color: #6366f1; text-align: right; }
    .doc-no { font-size: 13px; color: #555; text-align: right; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
    .meta-box h4 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #888; margin-bottom: 6px; }
    .meta-box p { font-size: 13px; line-height: 1.6; }
    .meta-box .bold { font-weight: 700; font-size: 14px; }
    .dates-row { display: flex; gap: 24px; margin-bottom: 24px; }
    .date-pill { background: #f3f4f6; border-radius: 8px; padding: 8px 16px; }
    .date-pill .label { font-size: 10px; color: #888; text-transform: uppercase; font-weight: 600; }
    .date-pill .value { font-size: 13px; font-weight: 600; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { padding: 8px 10px; text-align: left; background: #f3f4f6; border-bottom: 2px solid #d1d5db; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #555; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
    .totals-box { width: 260px; }
    .totals-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    .totals-row.grand { font-weight: 700; font-size: 16px; color: #6366f1; border-top: 2px solid #6366f1; border-bottom: none; padding-top: 10px; margin-top: 4px; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; background: #fef3c7; color: #d97706; }
    .status-paid { background: #d1fae5; color: #059669; }
    .notes { background: #f9fafb; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; }
    .notes h4 { font-size: 11px; color: #888; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
    .footer { text-align: center; font-size: 11px; color: #aaa; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    @media print {
      @page { size: A4 portrait; margin: 12mm 14mm; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${company.name}</div>
      <div class="company-meta">
        ${company.address ? company.address + '<br/>' : ''}
        ${company.phone ? 'Ph: ' + company.phone + ' &nbsp;|&nbsp; ' : ''}
        ${company.email ? company.email : ''}
        ${company.gstin ? '<br/>GSTIN: ' + company.gstin : ''}
      </div>
    </div>
    <div>
      <div class="doc-title">${title}</div>
      <div class="doc-no"># ${docNo}</div>
      <div style="margin-top:6px;">
        <span class="status-badge ${doc.status === 'paid' || doc.status === 'accepted' ? 'status-paid' : ''}">${(doc.status || 'draft').toUpperCase()}</span>
      </div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <h4>Bill To</h4>
      <p class="bold">${client.companyName || client.name || '—'}</p>
      ${client.contactPerson ? '<p>' + client.contactPerson + '</p>' : ''}
      ${client.address ? '<p>' + client.address + '</p>' : ''}
      ${client.phone ? '<p>Ph: ' + client.phone + '</p>' : ''}
      ${client.email ? '<p>' + client.email + '</p>' : ''}
      ${client.gstNumber ? '<p>GSTIN: ' + client.gstNumber + '</p>' : ''}
    </div>
    <div class="meta-box" style="text-align:right;">
      <h4>&nbsp;</h4>
      <div class="dates-row" style="justify-content:flex-end;">
        <div class="date-pill">
          <div class="label">${dateLabel}</div>
          <div class="value">${docDate}</div>
        </div>
        <div class="date-pill">
          <div class="label">${dueLabel}</div>
          <div class="value">${dueDate}</div>
        </div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="background:#f3f4f6;border-bottom:2px solid #d1d5db;">Description</th>
        <th style="text-align:center;background:#f3f4f6;border-bottom:2px solid #d1d5db;">Qty</th>
        <th style="text-align:right;background:#f3f4f6;border-bottom:2px solid #d1d5db;">Unit Price</th>
        ${gstCol}
        <th style="text-align:right;background:#f3f4f6;border-bottom:2px solid #d1d5db;">Amount</th>
      </tr>
    </thead>
    <tbody>${items}</tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>Subtotal</span><span>${rupees(doc.subtotal)}</span></div>
      ${doc.discountAmount ? `<div class="totals-row"><span>Discount</span><span>- ${rupees(doc.discountAmount)}</span></div>` : ''}
      ${doc.gstEnabled && doc.cgst ? `<div class="totals-row"><span>CGST</span><span>${rupees(doc.cgst)}</span></div>` : ''}
      ${doc.gstEnabled && doc.sgst ? `<div class="totals-row"><span>SGST</span><span>${rupees(doc.sgst)}</span></div>` : ''}
      ${doc.gstEnabled && doc.igst ? `<div class="totals-row"><span>IGST</span><span>${rupees(doc.igst)}</span></div>` : ''}
      <div class="totals-row grand"><span>Total</span><span>${rupees(doc.total)}</span></div>
      ${isInvoice && doc.amountPaid ? `<div class="totals-row" style="color:#059669;font-weight:600;"><span>Paid</span><span>- ${rupees(doc.amountPaid)}</span></div>` : ''}
      ${isInvoice && doc.balanceDue ? `<div class="totals-row" style="font-weight:700;font-size:14px;color:#dc2626;"><span>Balance Due</span><span>${rupees(doc.balanceDue)}</span></div>` : ''}
    </div>
  </div>

  ${doc.notes ? `<div class="notes"><h4>Notes</h4><p>${doc.notes}</p></div>` : ''}
  ${doc.termsAndConditions ? `<div class="notes"><h4>Terms &amp; Conditions</h4><p>${doc.termsAndConditions}</p></div>` : ''}

  <div class="footer">Thank you for your business! &nbsp;·&nbsp; ${company.name}</div>

  <script>window.onload = function() { setTimeout(function() { window.print(); }, 400); }<\/script>
</body>
</html>`
}

export function usePDFDownload() {
  const [generating, setGenerating] = useState(false)

  const downloadPDF = useCallback((doc, type = 'invoice', companyInfo = {}) => {
    setGenerating(true)
    const toastId = toast.loading('Opening print view…')
    try {
      const html = buildPrintHTML(doc, type, companyInfo)
      const win = window.open('', '_blank', 'width=920,height=720')
      if (!win) {
        toast.error('Popup blocked — allow popups for this site', { id: toastId })
        setGenerating(false)
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      toast.success('Print dialog opened — choose "Save as PDF"', { id: toastId })
    } catch (e) {
      console.error('PDF generation failed:', e)
      toast.error('Could not open print view', { id: toastId })
    } finally {
      setGenerating(false)
    }
  }, [])

  return { downloadPDF, generating }
}
