// components/RefundPolicyPage.tsx — public Refund Policy (no login required).

import React from 'react';
import LegalPage, { Section, Bullets, SITE_NAME, SUPPORT_EMAIL } from './LegalPage';

const RefundPolicyPage: React.FC = () => (
  <LegalPage
    title="Refund Policy"
    updated="23 June 2026"
    intro={
      <>
        We want you to be happy with your lessons. This policy explains when refunds are available and how
        to request one. It applies alongside our{' '}
        <a href="/terms" className="text-teal-600 dark:text-teal-300 hover:underline">Terms of Service</a>.
      </>
    }
  >
    <Section heading="1. Free trial">
      <p>
        New students can try a free trial lesson before subscribing, so you can decide whether {SITE_NAME}
        is right for you before any payment is made.
      </p>
    </Section>

    <Section heading="2. Monthly subscriptions">
      <Bullets items={[
        'If you have not used any sessions in the current billing period, you may request a full refund within 7 days of that payment.',
        'If some sessions have already been delivered, we may issue a pro-rated refund for the unused, undelivered sessions in that period.',
        'Completed (delivered) lessons are non-refundable.',
      ]} />
    </Section>

    <Section heading="3. Cancellation vs. refund">
      <p>
        Cancelling your plan stops future renewals but is not itself a refund. After cancelling, your plan
        remains active until the end of the current billing period. If you also want a refund for the
        current period, please request it as described below.
      </p>
    </Section>

    <Section heading="4. Missed or cancelled lessons">
      <Bullets items={[
        'Lessons cancelled with reasonable advance notice can usually be rescheduled at no extra cost.',
        'Lessons missed without reasonable notice may be counted as delivered and are not refundable.',
        'If a teacher cancels a session, it will be rescheduled or credited to you.',
      ]} />
    </Section>

    <Section heading="5. How to request a refund">
      <p>
        Email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 dark:text-teal-300 hover:underline">{SUPPORT_EMAIL}</a>{' '}
        with the email address on your account and the payment date. We aim to respond within 2 business days.
      </p>
    </Section>

    <Section heading="6. How refunds are processed">
      <p>
        Approved refunds are issued through our payment processor and Merchant of Record,{' '}
        <strong>Paddle.com</strong>, back to your original payment method. Depending on your bank, it may
        take a few business days for the funds to appear.
      </p>
    </Section>

    <Section heading="7. Changes to this policy">
      <p>
        We may update this Refund Policy from time to time. Material changes will be posted here with an
        updated date.
      </p>
    </Section>

    <Section heading="8. Contact">
      <p>
        Questions about refunds? Contact us at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 dark:text-teal-300 hover:underline">{SUPPORT_EMAIL}</a>.
      </p>
    </Section>
  </LegalPage>
);

export default RefundPolicyPage;
