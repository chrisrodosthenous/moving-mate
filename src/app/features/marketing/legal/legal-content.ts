/** Draft legal copy for Moving Mate. Template for counsel review — not formal legal advice. */

export type LegalDocId = 'privacy' | 'terms' | 'cookies';

export interface LegalSection {
  /** Optional explicit fragment; otherwise derived from the heading. */
  id?: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface ResolvedLegalSection extends LegalSection {
  id: string;
}

export interface LegalDocument {
  id: LegalDocId;
  title: string;
  eyebrow: string;
  subtitle: string;
  lastUpdated: string;
  sections: LegalSection[];
}

export const LEGAL_LAST_UPDATED = '13 November 2026';

const DISCLAIMER =
  'This page is a product template tailored to how Moving Mate works today. It is not formal legal advice. Have a Cyprus / EU lawyer review and adapt it before relying on it for compliance.';

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocument> = {
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    eyebrow: 'Legal',
    subtitle: 'How Moving Mate collects, uses, and protects personal data.',
    lastUpdated: LEGAL_LAST_UPDATED,
    sections: [
      {
        heading: '1. Who we are',
        paragraphs: [
          DISCLAIMER,
          'Moving Mate (“we”, “us”) is a Cyprus-focused online platform that connects customers who need a move with verified drivers. For privacy questions, contact info@moving-mate.com.',
        ],
      },
      {
        heading: '2. Data we collect',
        paragraphs: ['Depending on how you use the platform, we may process:'],
        bullets: [
          'Account details: name, date of birth, email, phone number, password (stored hashed), and role (customer, driver, or admin).',
          'Driver verification: ID and driving-licence documents, licence number, vehicle type, plates, and vehicle photos.',
          'Move details: pickup and drop-off addresses, districts, cargo description, floors, elevator info, labour options, scheduled time, and price quotes.',
          'Location data: map coordinates for addresses and, during an active trip, the driver’s live location shared with the customer for tracking.',
          'Device and notification data: browser push (FCM) tokens, and basic technical logs needed to run and secure the service.',
          'Payment and wallet records: payment status and internal wallet / commission figures. Card charging is currently in mock / test mode unless we enable a live payment provider.',
          'Support messages you send through Contact or similar channels.',
        ],
      },
      {
        heading: '3. Why we process data (purposes and legal bases)',
        paragraphs: [
          'We process personal data to operate the marketplace (create accounts, match jobs, track moves, send transactional email and push notifications), to verify drivers, to prevent fraud and abuse, to comply with law, and to improve reliability and safety.',
          'Where GDPR applies, typical bases include performance of a contract, legitimate interests (security, product improvement, platform integrity), legal obligation, and consent where required (for example browser notification permission or non-essential cookies / similar technologies).',
        ],
      },
      {
        heading: '4. Sharing and processors',
        paragraphs: [
          'We do not sell your personal data. We share data with service providers that help us run Moving Mate, such as hosting, databases, maps, email delivery, and push messaging (for example infrastructure hosted with providers like Render, MongoDB Atlas, Google Maps, Firebase Cloud Messaging, and our email/SMTP provider).',
          'Drivers and customers see only what is needed to complete a move (for example contact and location details for an assigned job). Admins may access accounts and documents to verify drivers, support users, and operate the platform, including limited impersonation tools used for support.',
        ],
      },
      {
        heading: '5. Retention',
        paragraphs: [
          'We keep account and order records for as long as your account is active and as needed for disputes, accounting, security, and legal requirements. Driver verification documents are kept while needed for verification and compliance. You may request deletion or restriction subject to legal exceptions (for example outstanding payments or fraud prevention).',
        ],
      },
      {
        heading: '6. Your rights (EEA / Cyprus)',
        paragraphs: [
          'You may have rights to access, rectify, erase, restrict, or object to certain processing, and to data portability, where applicable. You may also lodge a complaint with the Office of the Commissioner for Personal Data Protection in Cyprus. To exercise rights, email info@moving-mate.com.',
        ],
      },
      {
        heading: '7. Security and international transfers',
        paragraphs: [
          'We use industry-standard measures such as encrypted transport (HTTPS), access controls, and hashed passwords. No method of transmission or storage is perfectly secure.',
          'Some processors may store or process data outside Cyprus. Where required, we rely on appropriate safeguards (such as standard contractual clauses) offered by those providers.',
        ],
      },
      {
        heading: '8. Children',
        paragraphs: [
          'Moving Mate is intended for adults. Registration requires a date of birth indicating you are at least 18. We do not knowingly collect data from children.',
        ],
      },
      {
        heading: '9. Changes',
        paragraphs: [
          'We may update this Privacy Policy when the product or law changes. The “Last updated” date at the top of this page will change when we do. Continued use after an update means you acknowledge the revised policy.',
        ],
      },
    ],
  },
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    eyebrow: 'Legal',
    subtitle: 'The rules for using the Moving Mate platform.',
    lastUpdated: LEGAL_LAST_UPDATED,
    sections: [
      {
        heading: '1. Agreement',
        paragraphs: [
          DISCLAIMER,
          'By creating an account or using Moving Mate at moving-mate.com, you agree to these Terms and our Privacy Policy. If you do not agree, do not use the service.',
        ],
      },
      {
        heading: '2. The platform',
        paragraphs: [
          'Moving Mate is a marketplace that helps customers book transport / moving jobs and helps drivers find and complete those jobs. We provide software, matching, pricing tools, tracking, and related features. Unless we say otherwise in writing, we are not the carrier of your goods and drivers using the platform are independent service providers, not employees of Moving Mate.',
        ],
      },
      {
        heading: '3. Accounts',
        paragraphs: [
          'You must provide accurate information and keep your login secure. Customers and drivers have different capabilities. Drivers must complete verification (including identity and vehicle documents) and be approved before accepting paid jobs. We may suspend or close accounts for fraud, abuse, safety risks, or Terms violations.',
        ],
      },
      {
        heading: '4. Booking, pricing, and payments',
        paragraphs: [
          'Quotes are generated from the details you provide (distance, vehicle tier, floors, labour options, and related inputs) and our published pricing rules. You are responsible for accurate job details.',
          'Payments may currently run in mock / test mode. When live payments are enabled, charges, captures, refunds, and driver payouts will follow the payment provider’s rules and any refund policy we publish. Platform commission and driver earnings are calculated according to our then-current payout model.',
        ],
      },
      {
        heading: '5. Cancellations and status updates',
        paragraphs: [
          'Customers may cancel a pending job before a driver accepts it, subject to any payment rules then in force. After acceptance, status progresses through steps such as accepted, driver on the way, picked up, and delivered. Drivers must update status honestly. Misuse of the status flow may lead to suspension.',
        ],
      },
      {
        heading: '6. Acceptable use',
        paragraphs: [
          'You must not use Moving Mate for unlawful cargo, dangerous goods prohibited by law, harassment, fake documents, scraping, or attempts to bypass security or payments. We may remove content, cancel jobs, or ban accounts that break these rules.',
        ],
      },
      {
        heading: '7. Location and communications',
        paragraphs: [
          'Drivers may share live location during active trips so customers can track progress. We send transactional emails and may send push notifications about account and job events. You can control browser notification permission in your device settings.',
        ],
      },
      {
        heading: '8. Liability',
        paragraphs: [
          'The platform is provided on an “as available” basis. To the fullest extent permitted by Cyprus and EU law, Moving Mate is not liable for indirect or consequential losses, or for loss or damage to goods during a move performed by a driver, except where liability cannot be excluded (including mandatory consumer rights). Our total liability for claims arising from the platform software is limited to the fees you paid to us for the job giving rise to the claim, where applicable.',
        ],
      },
      {
        heading: '9. Governing law',
        paragraphs: [
          'These Terms are governed by the laws of the Republic of Cyprus. Courts in Cyprus have jurisdiction, without limiting any mandatory consumer protections that apply where you live in the EU.',
        ],
      },
      {
        heading: '10. Contact',
        paragraphs: ['Questions about these Terms: info@moving-mate.com.'],
      },
    ],
  },
  cookies: {
    id: 'cookies',
    title: 'Cookie & tracking notice',
    eyebrow: 'Legal',
    subtitle: 'How Moving Mate uses cookies and similar technologies in the browser.',
    lastUpdated: LEGAL_LAST_UPDATED,
    sections: [
      {
        heading: '1. Overview',
        paragraphs: [
          DISCLAIMER,
          'Moving Mate uses essential storage and similar technologies so you can sign in, stay signed in, receive push notifications if you allow them, and use maps. We do not currently run a separate advertising cookie network on the marketing site.',
        ],
      },
      {
        heading: '2. What we use',
        paragraphs: ['Examples of technologies we use:'],
        bullets: [
          'Essential local storage / session storage for authentication tokens and session state so the app can keep you signed in.',
          'Push notification tokens (FCM) stored locally and on our servers after you grant browser notification permission.',
          'Preference flags such as dismissing this cookie notice.',
          'Google Maps embeds and related network requests when you set pickup/drop-off locations or track a move.',
        ],
      },
      {
        heading: '3. Consent and choices',
        paragraphs: [
          'Essential storage required to run the logged-in product is used on the basis of providing the service you request. Browser notification permission is optional; you can deny or revoke it in your browser settings.',
          'You can clear site data in your browser at any time. Clearing storage will sign you out and may remove local notification tokens until you sign in again.',
        ],
      },
      {
        heading: '4. More information',
        paragraphs: [
          'For personal data processing more broadly, see our Privacy Policy. For product rules, see our Terms of Service. Contact: info@moving-mate.com.',
        ],
      },
    ],
  },
};

function sectionId(heading: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function legalDocument(id: LegalDocId): LegalDocument & { sections: ResolvedLegalSection[] } {
  const doc = LEGAL_DOCUMENTS[id];
  return {
    ...doc,
    sections: doc.sections.map((section) => ({
      ...section,
      id: sectionId(section.heading, section.id),
    })),
  };
}
