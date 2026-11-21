import type { SESEvent } from 'aws-lambda';
import { isAuthentic } from '../shared/inbound';
import { resolveMail, takeMailAllowance } from '../shared/mail-resolve';

type Disposition = { disposition: 'CONTINUE' | 'STOP_RULE_SET' };
const STOP: Disposition = { disposition: 'STOP_RULE_SET' };

/**
 * Runs first, while SES holds the mail, and decides whether anything is
 * kept. Stopping the rule set drops the mail with no bounce and no reply,
 * so a sender can never tell which of the many reasons applied.
 */
export async function handler(event: SESEvent): Promise<Disposition> {
  try {
    const message = event.Records[0].ses;
    const domain = process.env.MAIL_DOMAIN;
    if (!domain || !isAuthentic(message.receipt)) return STOP;
    const target = await resolveMail(message, domain);
    if (!target || !(await takeMailAllowance(target.userId))) return STOP;
    return { disposition: 'CONTINUE' };
  } catch (e) {
    console.error('mail gate', e); // fail closed, and quietly
    return STOP;
  }
}
