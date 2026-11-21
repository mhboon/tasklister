# Sharing to Tasklister

## Android

Install the app from Chrome (**Install app**). It then appears in the share
sheet and opens the `/share` form (title, notes, due date, priority, list).
If you installed it before the share target existed, remove it and install
it again.

## iPhone

iOS doesn't support Web Share Target, so the installed app can't appear in the
share sheet. Use an Apple Shortcut that opens the same `/share` page. Replace
`<your-domain>` with your site's domain.

One-time setup, per iPhone:

1. Open **Shortcuts**, tap **+**, name it `Share to Tasklister`.
2. Open its settings (ⓘ) and enable **Show in Share Sheet**. Under **Share
   Sheet Types** keep only **URLs** and **Text**.
3. Add these actions in order:
   1. **Get Name** of *Shortcut Input* (the title).
   2. **URL Encode** the *Name* → `EncodedTitle`.
   3. **URL Encode** *Shortcut Input* → `Encoded`.
   4. **Text**: `https://<your-domain>/share?title=[EncodedTitle]&text=[Encoded]`
   5. **Open URLs** with that text.

Minimal version: skip 1 and 2 and use `https://<your-domain>/share?text=[Encoded]`.

Use it from any app: **Share → Share to Tasklister** (first time, tap **Edit
Actions…** to pin it near the top). The page opens in Safari, not the
home-screen app. If you aren't signed in, you sign in first and then land on
the form with your shared text.

## Limits

A share only carries what the sending app provides (`title`, `text`, `url`).
Instagram, LinkedIn and Gmail usually send just a link, and Gmail links are
behind login. Fetching a page's title/description from the link on the server
is not built.
