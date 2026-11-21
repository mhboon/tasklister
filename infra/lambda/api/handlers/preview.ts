import { requireUser } from '../../shared/access';
import { UserError } from '../../shared/db';
import { fetchPreview } from '../../shared/preview-fetch';
import { parseFetchableUrl } from '../../shared/preview';
import type { Ctx } from '../../shared/types';

/** Title and description of a shared link, for pre-filling the share form. */
export async function linkPreview(ctx: Ctx, args: { url: string }) {
  requireUser(ctx);
  if (typeof args.url !== 'string' || args.url.length > 2000 || !parseFetchableUrl(args.url)) {
    throw new UserError('That is not a link I can look up.');
  }
  return fetchPreview(args.url);
}
