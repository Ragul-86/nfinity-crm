import { Link } from 'react-router-dom'
import { ArrowLeft, Zap } from 'lucide-react'

// ─── Remaining placeholders (must be completed before publishing) ────────────
//   [EFFECTIVE DATE]        — set to the date this policy goes live (e.g. 29 October 2026)
//   [YOUR COUNTRY/REGION]   — jurisdiction for data storage (e.g. India, Singapore)
// ─────────────────────────────────────────────────────────────────────────────

const LAST_UPDATED = '[EFFECTIVE DATE]'

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-foreground mb-3 pb-2 border-b border-border">
        {title}
      </h2>
      <div className="space-y-3 text-muted-foreground leading-relaxed">
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top bar ── */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link
            to="/login"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">Nfinity CRM</span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            This Privacy Policy explains how <strong className="text-foreground">NFINITY PARTNER</strong>{' '}
            (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) collects, uses, and protects
            information when you use <strong className="text-foreground">Nfinity CRM</strong> (the
            &ldquo;Service&rdquo;). By using the Service, you agree to the practices described here.
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70 italic">
            Note: This document is a draft for operational transparency purposes. It does not constitute
            legal advice and does not guarantee compliance with any specific law or regulation.
            You should have a qualified legal professional review it before publishing.
          </p>
        </div>

        <Section title="1. Information We Collect">
          <p>We collect the following categories of information:</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2 ml-2">
            <li>
              <strong className="text-foreground">Account information</strong> — your name, email address,
              and password when you register or accept an invitation.
            </li>
            <li>
              <strong className="text-foreground">Workspace data</strong> — leads, contacts, pipelines,
              campaigns, tasks, projects, and other CRM records you create or import.
            </li>
            <li>
              <strong className="text-foreground">Usage data</strong> — log records, timestamps, IP
              addresses, and actions taken within the Service (used for security auditing and
              troubleshooting).
            </li>
            <li>
              <strong className="text-foreground">Google account information</strong> — if you connect a
              Google account, we receive an OAuth access token, refresh token, and your Google email
              address. We do not receive your Google password.
            </li>
            <li>
              <strong className="text-foreground">Google Sheets data</strong> — if you configure a Google
              Sheets integration, we read the content of the specific spreadsheet(s) you select in order
              to import lead records into your CRM workspace.
            </li>
            <li>
              <strong className="text-foreground">Communications</strong> — messages you send to us for
              support purposes.
            </li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <p>We use the information we collect to:</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2 ml-2">
            <li>Provide, operate, and maintain the Service.</li>
            <li>Authenticate your identity and enforce workspace-level access controls.</li>
            <li>Sync lead data from connected Google Sheets spreadsheets into your CRM workspace.</li>
            <li>Send transactional notifications (e.g. invitations, password resets).</li>
            <li>Detect and prevent fraud, abuse, and security incidents.</li>
            <li>Improve and debug the Service based on aggregate usage patterns.</li>
            <li>Respond to support requests.</li>
          </ul>
          <p>
            We do not sell your personal data to third parties. We do not use your data for targeted
            advertising.
          </p>
        </Section>

        <Section title="3. Google Account and Google Sheets Integration">
          <p>
            Nfinity CRM offers an optional integration with Google Sheets via Google OAuth 2.0. When
            you choose to connect a Google account:
          </p>
          <ul className="list-disc list-inside space-y-1.5 mt-2 ml-2">
            <li>
              We request access to{' '}
              <strong className="text-foreground">Google Drive (drive.file scope)</strong> to allow you
              to browse and select spreadsheet files using the Google Picker.
            </li>
            <li>
              We request{' '}
              <strong className="text-foreground">Google Sheets read-only access
              (spreadsheets.readonly scope)</strong> to read the rows of spreadsheets you explicitly
              select.
            </li>
            <li>
              We store your Google OAuth access token and refresh token in encrypted form in our
              database. These tokens are never transmitted to third parties.
            </li>
            <li>
              Access tokens are automatically refreshed as needed to maintain the integration you
              configured.
            </li>
            <li>
              We only read spreadsheet content from files you explicitly select. We do not browse,
              index, or access any other files in your Google Drive.
            </li>
            <li>
              You can disconnect your Google account at any time from the Integrations page in your
              workspace settings. Disconnecting immediately revokes our stored tokens and stops all
              Google Sheets syncing.
            </li>
          </ul>
          <p>
            Our use of data obtained through Google APIs complies with the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="4. Data Storage and Security">
          <p>
            Your data is stored on servers located in{' '}
            <strong className="text-foreground">[YOUR COUNTRY/REGION]</strong>. We use
            industry-standard measures to protect your data, including:
          </p>
          <ul className="list-disc list-inside space-y-1.5 mt-2 ml-2">
            <li>Encryption of sensitive credentials (OAuth tokens, secrets) at rest using AES-256-GCM.</li>
            <li>HTTPS/TLS for all data in transit.</li>
            <li>Role-based access controls and workspace isolation so that one workspace cannot access
              another's data.</li>
            <li>Audit logging of administrative actions.</li>
          </ul>
          <p>
            No method of storage or transmission is 100% secure. We cannot guarantee absolute security.
          </p>
        </Section>

        <Section title="5. Data Sharing">
          <p>We do not share your personal data with third parties except as follows:</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2 ml-2">
            <li>
              <strong className="text-foreground">Infrastructure providers</strong> — cloud hosting,
              database, and deployment providers who process data on our behalf under confidentiality
              obligations.
            </li>
            <li>
              <strong className="text-foreground">Google APIs</strong> — when you use the Google Sheets
              integration, data is exchanged with Google's servers under Google's own privacy policies.
            </li>
            <li>
              <strong className="text-foreground">Legal requirements</strong> — if required by law,
              court order, or to protect our rights or the safety of others.
            </li>
          </ul>
        </Section>

        <Section title="6. Data Retention">
          <p>
            We retain your account data for as long as your account is active or as needed to provide
            the Service. CRM records (leads, contacts, etc.) are retained until you delete them or
            request account deletion. Log data and audit records are retained for a limited period for
            security purposes and then deleted.
          </p>
        </Section>

        <Section title="7. Your Rights — Account and Data Deletion">
          <p>
            You have the right to access, correct, and delete the personal data we hold about you.
            To request account deletion or a copy of your data, contact us at{' '}
            <strong className="text-foreground">suganya.nfinitypartner@gmail.com</strong>. We will process deletion
            requests within a reasonable time, subject to any legal obligations to retain certain
            records.
          </p>
          <p>
            To remove the Google Sheets integration specifically, disconnect your Google account from
            the Integrations page inside your workspace. This removes all stored OAuth tokens
            immediately.
          </p>
        </Section>

        <Section title="8. Cookies">
          <p>
            The Service uses authentication tokens stored in your browser&apos;s local storage to
            maintain your login session. We do not use third-party tracking cookies or advertising
            cookies.
          </p>
        </Section>

        <Section title="9. Children's Privacy">
          <p>
            The Service is not directed at children under the age of 13 (or the applicable minimum
            age in your jurisdiction). We do not knowingly collect personal data from children.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify registered users of
            material changes by updating the &ldquo;Last updated&rdquo; date at the top of this page.
            Continued use of the Service after changes constitutes acceptance of the revised policy.
          </p>
        </Section>

        <Section title="11. Contact Us">
          <p>
            If you have questions about this Privacy Policy or wish to exercise your data rights,
            please contact us at:
          </p>
          <address className="not-italic mt-2 ml-2 space-y-1">
            <p><strong className="text-foreground">NFINITY PARTNER</strong></p>
            <p>
              Email:{' '}
              <a
                href="mailto:suganya.nfinitypartner@gmail.com"
                className="text-primary hover:underline"
              >
                suganya.nfinitypartner@gmail.com
              </a>
            </p>
          </address>
        </Section>

        {/* Footer nav */}
        <div className="pt-8 border-t border-border flex flex-wrap gap-4 text-sm text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link to="/login" className="hover:text-foreground transition-colors">Sign In</Link>
        </div>
      </div>
    </div>
  )
}
