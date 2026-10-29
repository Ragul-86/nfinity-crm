import { Link } from 'react-router-dom'
import { ArrowLeft, Zap } from 'lucide-react'

// ─── Remaining placeholders (must be completed before publishing) ────────────
//   [EFFECTIVE DATE]        — set to the date these terms go live (e.g. 29 October 2026)
//   [YOUR COUNTRY/REGION]   — governing law jurisdiction (e.g. India, Singapore)
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

export default function Terms() {
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
          <h1 className="text-3xl font-bold text-foreground mb-2">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of{' '}
            <strong className="text-foreground">Nfinity CRM</strong> (the &ldquo;Service&rdquo;),
            operated by <strong className="text-foreground">NFINITY PARTNER</strong>{' '}
            (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By accessing or using the
            Service, you agree to be bound by these Terms.
          </p>
          <p className="mt-2 text-xs text-muted-foreground/70 italic">
            Note: This document is a draft for operational transparency purposes. It does not constitute
            legal advice. You should have a qualified legal professional review it before publishing.
          </p>
        </div>

        <Section title="1. Eligibility and Account Registration">
          <p>
            You must be at least 18 years old and capable of entering a legally binding contract to
            use the Service. By registering, you confirm that the information you provide is accurate
            and that you will keep it up to date.
          </p>
          <p>
            You are responsible for maintaining the confidentiality of your login credentials. You
            agree to notify us immediately at{' '}
            <strong className="text-foreground">suganya.nfinitypartner@gmail.com</strong> if you suspect any
            unauthorised access to your account.
          </p>
        </Section>

        <Section title="2. Acceptable Use">
          <p>You agree to use the Service only for lawful purposes and in accordance with these Terms. You must not:</p>
          <ul className="list-disc list-inside space-y-1.5 mt-2 ml-2">
            <li>Upload or transmit content that is unlawful, harmful, defamatory, or infringing.</li>
            <li>
              Use the Service to store or process personal data of individuals without a lawful basis
              for doing so under applicable data protection laws.
            </li>
            <li>
              Attempt to gain unauthorised access to any part of the Service, its servers, or
              connected systems.
            </li>
            <li>
              Interfere with or disrupt the integrity or performance of the Service or any third-party
              data contained within.
            </li>
            <li>
              Reverse-engineer, decompile, or attempt to extract the source code of the Service.
            </li>
            <li>Use automated tools to scrape, crawl, or extract data from the Service without our
              prior written consent.</li>
            <li>
              Resell, sublicense, or otherwise make the Service available to third parties without
              our authorisation.
            </li>
          </ul>
        </Section>

        <Section title="3. Account Responsibilities">
          <p>
            You are solely responsible for all activity that occurs under your account and within
            your workspace. This includes the actions of any team members you invite. You must
            ensure that all users you add comply with these Terms.
          </p>
          <p>
            Workspace Owners and Administrators are responsible for configuring appropriate access
            roles and permissions for their team. We are not liable for losses caused by
            misconfigured permissions.
          </p>
        </Section>

        <Section title="4. Third-Party Services and Integrations">
          <p>
            The Service integrates with third-party platforms, including Google (Google Sheets,
            Google Drive). Your use of those services is subject to their own terms of service and
            privacy policies, including:
          </p>
          <ul className="list-disc list-inside space-y-1.5 mt-2 ml-2">
            <li>
              <a
                href="https://policies.google.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google Terms of Service
              </a>
            </li>
            <li>
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Google Privacy Policy
              </a>
            </li>
          </ul>
          <p>
            When you connect a Google account, you grant us access to specific Google data as
            described in our{' '}
            <Link to="/privacy-policy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            . We are not responsible for the availability, accuracy, or policies of any third-party
            service.
          </p>
        </Section>

        <Section title="5. Data Handling">
          <p>
            Your use of the Service and our handling of any personal data processed through it are
            governed by our{' '}
            <Link to="/privacy-policy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            , which is incorporated into these Terms by reference.
          </p>
          <p>
            You retain ownership of all data you upload, create, or import into the Service
            (&ldquo;Your Content&rdquo;). You grant us a limited licence to store, process, and
            display Your Content solely for the purpose of providing the Service to you.
          </p>
          <p>
            You are responsible for ensuring that any personal data you process through the Service
            is done so in compliance with applicable laws, including obtaining any required consents
            from the individuals whose data you store.
          </p>
        </Section>

        <Section title="6. Service Availability">
          <p>
            We aim to keep the Service available and operational but do not guarantee uninterrupted
            access. The Service may be temporarily unavailable due to maintenance, updates, or
            circumstances beyond our control.
          </p>
          <p>
            We reserve the right to modify, suspend, or discontinue any feature of the Service at
            any time with reasonable notice where practicable.
          </p>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            All rights, title, and interest in and to the Service (excluding Your Content) remain
            with us. Nothing in these Terms transfers any intellectual property rights to you.
          </p>
        </Section>

        <Section title="8. Disclaimer of Warranties">
          <p>
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
            warranties of any kind, either express or implied, including but not limited to
            warranties of merchantability, fitness for a particular purpose, or non-infringement.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            To the maximum extent permitted by applicable law, we shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, or any loss of data,
            profits, or business, arising out of or in connection with your use of the Service, even
            if we have been advised of the possibility of such damages.
          </p>
        </Section>

        <Section title="10. Termination">
          <p>
            Either party may terminate access to the Service at any time. We may suspend or
            terminate your account if you violate these Terms, engage in fraudulent activity, or if
            required by law.
          </p>
          <p>
            Upon termination, your right to access the Service ceases immediately. You may request a
            copy of your data before termination by contacting us at{' '}
            <strong className="text-foreground">suganya.nfinitypartner@gmail.com</strong>. We will retain your
            data for a limited period after termination in accordance with our Privacy Policy, after
            which it will be deleted.
          </p>
        </Section>

        <Section title="11. Changes to These Terms">
          <p>
            We may update these Terms from time to time. We will notify registered users of material
            changes by updating the &ldquo;Last updated&rdquo; date above. Continued use of the
            Service after changes constitutes acceptance of the revised Terms. If you do not agree
            to the revised Terms, you must stop using the Service.
          </p>
        </Section>

        <Section title="12. Governing Law">
          <p>
            These Terms are governed by and construed in accordance with the laws of{' '}
            <strong className="text-foreground">[YOUR COUNTRY/REGION]</strong>, without regard to
            its conflict of law provisions.
          </p>
        </Section>

        <Section title="13. Contact Us">
          <p>
            If you have questions about these Terms, please contact us at:
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
          <Link to="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link to="/login" className="hover:text-foreground transition-colors">Sign In</Link>
        </div>
      </div>
    </div>
  )
}
