/**
 * InvoicePDFTemplate
 * Hidden render target that jsPDF/html2canvas captures.
 * Keep it white-background / print-friendly — no dark theme.
 */
import { format } from 'date-fns'

function fmt(n) {
  if (!n && n !== 0) return '₹0.00'
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function InvoicePDFTemplate({ doc, type = 'invoice', companyInfo = {} }) {
  if (!doc) return null

  const isInvoice = type === 'invoice'
  const title     = isInvoice ? 'INVOICE' : 'QUOTATION'
  const number    = isInvoice ? doc.invoiceNumber : doc.quoteNumber
  const dateLabel = isInvoice ? 'Invoice Date' : 'Quote Date'
  const refLabel  = isInvoice ? 'Due Date' : 'Valid Until'
  const refDate   = isInvoice ? doc.dueDate : doc.validUntil
  const client    = doc.client || {}

  const showGST   = doc.gstType && doc.gstType !== 'non_gst'

  return (
    <div
      id="pdf-render-target"
      style={{
        width: '794px', minHeight: '1123px', padding: '48px 56px',
        background: '#ffffff', color: '#111827', fontFamily: 'Arial, sans-serif',
        fontSize: '13px', lineHeight: '1.5', boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#1e40af', marginBottom: '4px' }}>
            {companyInfo.name || 'Your Company'}
          </div>
          {companyInfo.address && <div style={{ color: '#6b7280', fontSize: '12px' }}>{companyInfo.address}</div>}
          {companyInfo.gstin && <div style={{ color: '#6b7280', fontSize: '12px' }}>GSTIN: {companyInfo.gstin}</div>}
          {companyInfo.phone && <div style={{ color: '#6b7280', fontSize: '12px' }}>{companyInfo.phone}</div>}
          {companyInfo.email && <div style={{ color: '#6b7280', fontSize: '12px' }}>{companyInfo.email}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '28px', fontWeight: '800', color: '#1e40af', letterSpacing: '2px' }}>{title}</div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '4px' }}>#{number}</div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '2px solid #1e40af', marginBottom: '28px' }} />

      {/* Bill To + Meta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginBottom: '6px' }}>Bill To</div>
          <div style={{ fontWeight: '700', fontSize: '15px' }}>{client.companyName || 'Client'}</div>
          {client.brandName && client.brandName !== client.companyName && (
            <div style={{ color: '#6b7280', fontSize: '12px' }}>{client.brandName}</div>
          )}
          {client.email && <div style={{ color: '#6b7280', fontSize: '12px' }}>{client.email}</div>}
          {client.phone && <div style={{ color: '#6b7280', fontSize: '12px' }}>{client.phone}</div>}
          {doc.clientGstNumber && <div style={{ color: '#6b7280', fontSize: '12px' }}>GSTIN: {doc.clientGstNumber}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <table style={{ fontSize: '13px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ color: '#6b7280', paddingRight: '16px', paddingBottom: '4px' }}>{dateLabel}:</td>
                <td style={{ fontWeight: '600', paddingBottom: '4px' }}>
                  {doc.createdAt ? format(new Date(doc.createdAt), 'dd MMM yyyy') : '—'}
                </td>
              </tr>
              {refDate && (
                <tr>
                  <td style={{ color: '#6b7280', paddingRight: '16px', paddingBottom: '4px' }}>{refLabel}:</td>
                  <td style={{ fontWeight: '600', paddingBottom: '4px' }}>
                    {format(new Date(refDate), 'dd MMM yyyy')}
                  </td>
                </tr>
              )}
              {isInvoice && (
                <tr>
                  <td style={{ color: '#6b7280', paddingRight: '16px', paddingBottom: '4px' }}>Status:</td>
                  <td style={{ fontWeight: '600', textTransform: 'capitalize', paddingBottom: '4px' }}>{doc.status}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
        <thead>
          <tr style={{ background: '#1e40af', color: '#ffffff' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>#</th>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>Description</th>
            {doc.gstType !== 'non_gst' && <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', fontWeight: '600' }}>HSN</th>}
            <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }}>Qty</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }}>Unit Price</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }}>Tax%</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '12px', fontWeight: '600' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(doc.items || []).map((item, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
              <td style={{ padding: '10px 12px', fontSize: '12px', color: '#6b7280' }}>{i + 1}</td>
              <td style={{ padding: '10px 12px', fontSize: '13px' }}>{item.description}</td>
              {doc.gstType !== 'non_gst' && <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '12px', color: '#6b7280' }}>{item.hsnCode || '—'}</td>}
              <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px' }}>{item.quantity}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px' }}>{fmt(item.unitPrice)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>{item.taxPercent || 0}%</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', fontWeight: '600' }}>{fmt(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '32px' }}>
        <table style={{ width: '280px', fontSize: '13px', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '5px 12px', color: '#6b7280' }}>Subtotal</td>
              <td style={{ padding: '5px 12px', textAlign: 'right' }}>{fmt(doc.subtotal)}</td>
            </tr>
            {(doc.discountAmount > 0) && (
              <tr>
                <td style={{ padding: '5px 12px', color: '#6b7280' }}>Discount ({doc.discountPercent}%)</td>
                <td style={{ padding: '5px 12px', textAlign: 'right', color: '#16a34a' }}>−{fmt(doc.discountAmount)}</td>
              </tr>
            )}
            {showGST && doc.cgst > 0 && (
              <tr>
                <td style={{ padding: '5px 12px', color: '#6b7280' }}>CGST</td>
                <td style={{ padding: '5px 12px', textAlign: 'right' }}>{fmt(doc.cgst)}</td>
              </tr>
            )}
            {showGST && doc.sgst > 0 && (
              <tr>
                <td style={{ padding: '5px 12px', color: '#6b7280' }}>SGST</td>
                <td style={{ padding: '5px 12px', textAlign: 'right' }}>{fmt(doc.sgst)}</td>
              </tr>
            )}
            {showGST && doc.igst > 0 && (
              <tr>
                <td style={{ padding: '5px 12px', color: '#6b7280' }}>IGST</td>
                <td style={{ padding: '5px 12px', textAlign: 'right' }}>{fmt(doc.igst)}</td>
              </tr>
            )}
            {!showGST && doc.taxAmount > 0 && (
              <tr>
                <td style={{ padding: '5px 12px', color: '#6b7280' }}>Tax</td>
                <td style={{ padding: '5px 12px', textAlign: 'right' }}>{fmt(doc.taxAmount)}</td>
              </tr>
            )}
            <tr style={{ borderTop: '2px solid #1e40af' }}>
              <td style={{ padding: '10px 12px', fontWeight: '700', fontSize: '15px' }}>Total</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', fontSize: '15px', color: '#1e40af' }}>{fmt(doc.total)}</td>
            </tr>
            {isInvoice && doc.paidAmount > 0 && (
              <>
                <tr>
                  <td style={{ padding: '4px 12px', color: '#16a34a' }}>Paid</td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', color: '#16a34a' }}>{fmt(doc.paidAmount)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 12px', fontWeight: '600' }}>Outstanding</td>
                  <td style={{ padding: '4px 12px', textAlign: 'right', fontWeight: '600', color: '#dc2626' }}>{fmt(doc.outstanding)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Notes / Terms */}
      {(doc.notes || doc.termsAndConditions) && (
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '20px', marginTop: '8px' }}>
          {doc.notes && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontWeight: '700', fontSize: '12px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '4px' }}>Notes</div>
              <div style={{ fontSize: '12px', color: '#374151' }}>{doc.notes}</div>
            </div>
          )}
          {doc.termsAndConditions && (
            <div>
              <div style={{ fontWeight: '700', fontSize: '12px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '4px' }}>Terms & Conditions</div>
              <div style={{ fontSize: '12px', color: '#374151' }}>{doc.termsAndConditions}</div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '40px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', textAlign: 'center', fontSize: '11px', color: '#9ca3af' }}>
        Thank you for your business • {companyInfo.name || ''} • {companyInfo.email || ''} • {companyInfo.phone || ''}
      </div>
    </div>
  )
}
