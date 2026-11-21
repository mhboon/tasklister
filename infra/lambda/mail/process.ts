import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { SESEvent } from 'aws-lambda';
import { simpleParser } from 'mailparser';
import { buildItemText, isAuthentic, needsLookup } from '../shared/inbound';
import { putItem } from '../shared/items';
import { resolveMail } from '../shared/mail-resolve';
import { fetchPreview } from '../shared/preview-fetch';
import { composeSharedItem } from '../shared/share-format';

const s3 = new S3Client({});
const PREFIX = 'mail/';

/**
 * Turns an accepted mail into items. The gate already approved it; the checks
 * are repeated here so this function is safe on its own.
 */
export async function handler(event: SESEvent): Promise<void> {
  const message = event.Records[0].ses;
  const bucket = process.env.MAIL_BUCKET;
  const domain = process.env.MAIL_DOMAIN;
  if (!bucket || !domain) return;
  const Key = `${PREFIX}${message.mail.messageId}`;
  try {
    if (!isAuthentic(message.receipt)) return;
    const target = await resolveMail(message, domain);
    if (!target) return;

    const raw = await s3.send(new GetObjectCommand({ Bucket: bucket, Key }));
    const parsed = await simpleParser(Buffer.from(await raw.Body!.transformToByteArray()));
    let { title, notes } = buildItemText(parsed.subject, parsed.text);
    if (!title) return;
    if (needsLookup(title, notes)) {
      const p = await fetchPreview(title);
      const composed = composeSharedItem(title, p);
      if (composed) ({ title, notes } = composed);
    }
    for (const listId of target.listIds) await putItem({ listId, title, notes: notes || undefined });
  } catch (e) {
    console.error('mail process', e);
  } finally {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key })).catch(() => {});
  }
}
