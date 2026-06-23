// components/PrivacyPolicyPage.tsx — public Privacy Policy (no login required).

import React from 'react';
import LegalPage, { Section, Bullets, SITE_NAME, SUPPORT_EMAIL } from './LegalPage';

const PrivacyPolicyPage: React.FC = () => (
  <LegalPage
    title="Privacy Policy"
    updated="23 June 2026"
    intro={
      <>
        This Privacy Policy explains what information {SITE_NAME} collects, how we use it, and the choices
        you have. We aim to collect only what we need to deliver lessons and run the platform, and to keep
        it secure.
      </>
    }
  >
    <Section heading="1. Information we collect">
      <Bullets items={[
        <><strong>Account information</strong> — name, email, and (for students) optional date of birth and timezone, used to set up lessons and the student portal.</>,
        <><strong>Learning data</strong> — lesson progress, recitation/memorization records, mistakes, homework, notes, and attendance, used to track and share progress.</>,
        <><strong>Scheduling data</strong> — lesson times and, if you connect it, your Google Calendar events used to schedule and link lessons.</>,
        <><strong>Payment data</strong> — handled by our payment processor (Paddle). We receive confirmation of your plan and limited billing details, but we do not collect or store your full card number.</>,
        <><strong>Technical data</strong> — basic device/browser information and local storage used to keep you signed in and remember preferences (such as language and theme).</>,
      ]} />
    </Section>

    <Section heading="2. How we use information">
      <Bullets items={[
        'To provide and schedule lessons and operate the student portal.',
        'To track learning progress and generate reports for students and parents.',
        'To process payments, renewals, and refunds (via Paddle).',
        'To send service messages such as lesson reminders and subscription notices.',
        'To maintain security, prevent abuse, and improve the Service.',
      ]} />
    </Section>

    <Section heading="3. Service providers we share with">
      <p>We do not sell your personal information. We share data only with trusted providers that help us run the Service:</p>
      <Bullets items={[
        <><strong>Paddle</strong> — payment processing and billing (Merchant of Record).</>,
        <><strong>Supabase</strong> — secure database and authentication hosting.</>,
        <><strong>Google</strong> — Calendar and Meet, only if you choose to connect them, to schedule and run lessons.</>,
      ]} />
      <p>Each provider processes data under its own privacy terms and only as needed to provide its service to us.</p>
    </Section>

    <Section heading="4. Cookies & local storage">
      <p>
        We use essential cookies and browser local storage to keep you signed in and to remember
        preferences (such as language and theme). We do not use these for advertising.
      </p>
    </Section>

    <Section heading="5. Children’s privacy">
      <p>
        Lessons may be provided to children at the request of a parent or guardian. A parent/guardian
        arranges the account, consents to the collection of the child’s learning data, and can review it
        through the student portal. Please contact us to access or delete a child’s data.
      </p>
    </Section>

    <Section heading="6. Data retention">
      <p>
        We keep account and learning data for as long as your account is active or as needed to provide the
        Service, and as required for legal, tax, or accounting purposes. You can ask us to delete your data
        as described below.
      </p>
    </Section>

    <Section heading="7. Your rights">
      <p>
        Depending on your location, you may have the right to access, correct, export, or delete your
        personal information, and to object to or restrict certain processing. To exercise these rights,
        email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 dark:text-teal-300 hover:underline">{SUPPORT_EMAIL}</a>.
      </p>
    </Section>

    <Section heading="8. Security & international transfers">
      <p>
        We use industry-standard measures to protect your data, including encryption in transit and access
        controls. Our providers may store data in different countries; where data is transferred
        internationally, we rely on appropriate safeguards. No method of transmission is 100% secure, but
        we work to protect your information.
      </p>
    </Section>

    <Section heading="9. Changes to this policy">
      <p>
        We may update this Privacy Policy from time to time. Material changes will be posted here with an
        updated date.
      </p>
    </Section>

    <Section heading="10. Contact">
      <p>
        Questions or requests about your privacy? Contact us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 dark:text-teal-300 hover:underline">{SUPPORT_EMAIL}</a>.
      </p>
    </Section>
  </LegalPage>
);

export default PrivacyPolicyPage;
