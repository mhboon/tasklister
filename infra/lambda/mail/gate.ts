import type { SESEvent } from 'aws-lambda';
import { isAuthentic, parseAddress } from '../shared/inbound';
import { extractClaimCode, verifyClaim } from '../shared/senders';
import { resolveMail, takeMailAllowance } from '../shared/mail-resolve';

type Disposition = { disposition: 'CONTINUE' | 'STOP_RULE_SET' };
const STOP: Disposition = { disposition: 'STOP_RULE_SET' };

/** One line per mail: the decision and a reason code, never addresses or content. */
function decide(d: Disposition, reason: string): Disposition {
  console.log(JSON.stringify({ mailGate: d.disposition === 'CONTINUE' ? 'accept' : 'drop', reason }));
  return d;
}

/**
 * Runs first, while SES holds the mail, and decides whether anything is
 * kept. Stopping the rule set drops the mail with no bounce and no reply,
 * so a sender can never tell which of the many reasons applied.
 */
export async function handler(event: SESEvent): Promise<Disposition> {
  try {
    const message = event.Records[0].ses;
    const domain = process.env.MAIL_DOMAIN;
    if (!domain) return decide(STOP, 'no-domain-config');
    if (!isAuthentic(message.receipt)) return decide(STOP, 'not-authentic');
    // A mail that proves an extra sender address is used up here and creates no item.
    const code = extractClaimCode(message.mail.commonHeaders?.subject);
    const from = parseAddress(message.mail.commonHeaders?.from?.[0]);
    if (code && from && (await verifyClaim(code, from))) return decide(STOP, 'sender-verified');
    const target = await resolveMail(message, domain);
    if (!target) return decide(STOP, 'no-target');
    if (!(await takeMailAllowance(target.userId))) return decide(STOP, 'rate-limited');
    return decide({ disposition: 'CONTINUE' }, 'ok');
  } catch (e) {
    console.error('mail gate', e); // fail closed, and quietly
    return decide(STOP, 'error');
  }
}
