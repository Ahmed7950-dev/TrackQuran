// components/TermsOfServicePage.tsx — public Terms of Service (no login required).

import React from 'react';
import LegalPage, { Section, Bullets, SITE_NAME, SUPPORT_EMAIL } from './LegalPage';

const TermsOfServicePage: React.FC = () => (
  <LegalPage
    title="Terms of Service"
    updated="23 June 2026"
    intro={
      <>
        These Terms of Service ("Terms") govern your access to and use of the {SITE_NAME} website,
        platform, and online Quran and Arabic teaching services (together, the "Service"). By creating
        an account, purchasing a plan, or otherwise using the Service, you agree to these Terms. If you
        do not agree, please do not use the Service.
      </>
    }
  >
    <Section heading="1. The Service">
      <p>
        {SITE_NAME} provides live, one-to-one online Quran and Arabic lessons together with a learning
        platform that includes progress tracking, scheduling, lesson reminders, and a personal student
        portal. Lessons are delivered remotely (for example, via Google Meet or a similar video service).
      </p>
    </Section>

    <Section heading="2. Eligibility & accounts">
      <Bullets items={[
        'You must provide accurate registration information and keep it up to date.',
        'You are responsible for activity that happens under your account and for keeping your login credentials secure.',
        'Lessons for children are arranged and supervised by a parent or guardian, who accepts these Terms on the child’s behalf and is responsible for the child’s use of the Service.',
      ]} />
    </Section>

    <Section heading="3. Lessons & scheduling">
      <Bullets items={[
        'Lesson times are agreed between you and your teacher and shown in your portal and calendar.',
        'Please attend on time. Reschedule requests should be made as early as reasonably possible so the teacher can adjust the schedule.',
        'Missed sessions without reasonable notice may be counted as delivered, at our discretion.',
      ]} />
    </Section>

    <Section heading="4. Plans, payment & billing">
      <Bullets items={[
        <>Paid plans are billed in advance on a recurring (monthly) basis and renew automatically until cancelled.</>,
        <>Payments are processed by our authorized reseller and Merchant of Record, <strong>Paddle.com</strong>, which handles billing, invoicing, and applicable taxes. Your purchase is also subject to Paddle’s buyer terms.</>,
        <>You authorize us and Paddle to charge your selected payment method for the plan you choose, including at each renewal, until you cancel.</>,
        <>Refunds are handled in accordance with our <a href="/refunds" className="text-teal-600 dark:text-teal-300 hover:underline">Refund Policy</a>.</>,
      ]} />
    </Section>

    <Section heading="5. Cancellation">
      <p>
        You may cancel your plan at any time from your account or by contacting us. Cancellation stops
        future renewals; your plan remains active until the end of the current billing period, after which
        it will not renew.
      </p>
    </Section>

    <Section heading="6. Acceptable use">
      <p>You agree not to:</p>
      <Bullets items={[
        'Use the Service for any unlawful purpose or in breach of these Terms.',
        'Share, resell, or sublicense your account or lesson access without our permission.',
        'Record, copy, or redistribute lessons or teaching materials without consent.',
        'Attempt to disrupt, reverse-engineer, or gain unauthorized access to the platform.',
        'Behave abusively or disrespectfully toward teachers or staff.',
      ]} />
    </Section>

    <Section heading="7. Intellectual property">
      <p>
        The Qur’an is a sacred, public-domain text. All other platform software, design, branding, and
        original teaching materials are owned by {SITE_NAME} or its licensors and are provided to you for
        personal, non-commercial learning use only. You retain ownership of content you submit (such as
        your notes), and grant us a limited licence to host and display it to operate the Service.
      </p>
    </Section>

    <Section heading="8. Disclaimers">
      <p>
        The Service is provided "as is" and "as available". While we work hard to deliver high-quality
        teaching and a reliable platform, we do not guarantee uninterrupted availability, specific learning
        outcomes, or that the Service will be error-free. Third-party tools (such as video conferencing or
        calendar services) are governed by their own terms.
      </p>
    </Section>

    <Section heading="9. Limitation of liability">
      <p>
        To the maximum extent permitted by law, {SITE_NAME} will not be liable for any indirect, incidental,
        or consequential damages arising from your use of the Service. Our total liability for any claim
        relating to the Service is limited to the amount you paid us in the three (3) months before the claim.
      </p>
    </Section>

    <Section heading="10. Suspension & termination">
      <p>
        We may suspend or terminate access if these Terms are breached or to protect the Service, our
        teachers, or other users. You may stop using the Service at any time by cancelling your plan.
      </p>
    </Section>

    <Section heading="11. Changes to these Terms">
      <p>
        We may update these Terms from time to time. Material changes will be posted on this page with an
        updated date. Continued use of the Service after changes take effect means you accept the revised Terms.
      </p>
    </Section>

    <Section heading="12. Contact">
      <p>
        Questions about these Terms? Contact us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 dark:text-teal-300 hover:underline">{SUPPORT_EMAIL}</a>.
      </p>
    </Section>
  </LegalPage>
);

export default TermsOfServicePage;
