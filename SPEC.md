# Tasklister — Spec

A personal/family to-do app for browser (laptop and phone). Served at
`https://<your-domain>`.

## People and access

- Sign-in is email + password. **Only users an admin has created can sign in**;
  there is no self sign-up and no self-service password recovery.
- There are three roles. A **guest** only works on lists shared with them
  (no Inbox, can't create lists or folders). A **user** has a workspace of
  their own (Inbox, lists, folders, recurring items). An **admin** is a user
  who also manages people. A user may create guests (to share a list with someone
  new, from the list's share panel) but nothing more; only admins reset passwords
  or change roles.
- An admin creates a user (name, email, role). Nothing is emailed:
  the admin gets a one-time temporary password to pass on, and the user
  must choose their own at first sign-in. Admins can also reset a password,
  disable/re-enable a user and change roles, except that an admin can't
  disable or reset the password of another admin. Roles change one step at a
  time (guest ⇄ user ⇄ admin; so an admin can demote an admin to user, promote
  a guest to user and a user to admin) and never for yourself. The person is
  signed out so the new role applies at once.
- Google sign-in via Cognito is planned, not built. When added, it must only
  admit emails that already exist as users.

## Lists, folders, sharing

- Lists and items are private to their members: a list (and everything in it)
  is only visible to its owner and the people it is shared with, whatever role
  they have. Opening a list or item by its id without access behaves as if it
  doesn't exist.

- Every user has an **Inbox**: the default list, always first, can't be
  renamed, deleted, moved or shared.
- A user can create any number of lists. The creator is the **owner**.
- **Sharing:** the owner shares a list with an existing user by email. Every
  member (owner included) can add, edit, complete, uncomplete and remove items
  and subitems. Only the owner can rename, share, unshare or delete the list.
  A member can leave a list at any time. Deleting a list deletes its items for
  everyone.
- **Folders** organise lists. They are one level deep and **personal**: your
  folders and where you put a list are only what you see, even for a shared
  list. A list is in one folder or at the top level. Deleting a folder moves its
  lists to the top level; it never deletes lists. Deleting is a separate button
  inside the folder's edit dialog (the pencil in the navigation), with its own
  confirmation, so it can't be hit by accident.
- Lists are sorted alphabetically (case-insensitive), with the Inbox pinned first.
  Folders are sorted alphabetically too and shown below the top-level lists.
  All alphabetical sorting is case-insensitive.
- Each list shows its number of **open items** (not the number of shares),
  including 0.
- In a list view, a settings (⚙) button opens a screen with only the list's
  settings (rename, share, move to folder, delete/leave); the items are not
  shown next to it. Sharing picks from registered users.
- A shared list (one you share or that is shared with you) shows a
  multi-people icon next to its name in the navigation.

## Items

- An item has a title, optional **notes** (longer text), optional **due date**, optional **priority**
  (High / Medium / Low), and is open or completed (completed can be undone).
- An item can have **subitems**, each open or completed. Subitems have only a
  title and status.
- Removing an item asks for confirmation and takes its subitems with it.
- A new item is created from a title alone (one line, a + button). Date,
  priority, notes and subitems are set by opening the item: beside the list
  on a wide screen, as a screen of its own on a phone. Users work the same way.
- An opened item shows, in this order: a checkbox to complete it with the title, list (to move it), due date
  (clock button to pick, ✕ to clear), priority ("priority not set" when
  empty), subitems (the add box above the list; open ones A–Z, then completed ones
  A–Z), notes. List, due date and priority have no text labels. Back is
  an arrow only.
- An item can be moved to another list you can access, from the opened item.
  It takes its subitems along and leaves any recurrence it came from.
- Notes are shown as text with clickable links. The pencil edits them and the
  check stores them.
- URLs in an item's title are clickable and open in a new tab.
- Item delete is a trash icon, shown only when the item is opened.
- The opened item also shows when it was created (date and time, small and grey).
- Open items are sorted per list: Inbox newest first, other lists A–Z. The
  user can switch the sort with a small box next to the list name (AZ,
  Created, Priority, Due; ↑ ascending, ↓ descending: priority high → low →
  none, due date oldest → newest → none; descending is the exact reverse, so
  items without a priority or date come first). The choice is remembered
  per user (in the browser). Completed ones are collapsed below.

## Look and feel

- The navigation lists Recurring and Users (these are settings, not daily
  views) at the bottom, above Account.
- Everyday actions are icons with a hover/screen-reader label, one drawing per
  meaning across the app (pencil = edit/rename, trash = delete, people =
  share, + = add). In list settings the icons carry a short caption.
- Words stay where an action is rare, risky or needs explaining: the Users and
  Account pages, dialogs (Cancel, Create, Save, Delete…) and sign-in.

## Recurring items

- A recurring item is its own thing: name, **schedule**, **target list**,
  optional priority. Schedule = every N days / weeks (on a weekday) /
  months (on a day of month, clamped to short months), anchored on a start date.
- Every morning (~04:00 Amsterdam) each active recurring item that is due is
  created in its target list, **unless the previous one from the same recurrence
  is still open**. A skipped occurrence is not made up later.
- The created item's due date is the day it came up, so it appears in the agenda.
- Recurring items are personal (owned by whoever created them); the target list
  must be one they have access to. They can be paused, edited and deleted;
  items already created are left alone.

## Views

- **Agenda:** open items with a due date, across all your lists, oldest first,
  grouped by day. Overdue (before today, in the viewer's timezone) is red.
- **Priority:** open items that have a priority, across all your lists,
  grouped High / Medium / Low. Items **without** a priority are not shown.
- Agenda groups are sorted A–Z within a day; Priority groups A–Z within a
  level; recurring items are sorted A–Z.
- Both let you complete, edit and delete items in place.

## Interpretations worth checking

- "Items with priority are not shown" in Priority was read as *without*.
- Completed items are excluded from Agenda and Priority.
- Subitems are removed without a confirmation prompt; items ask.

## Installing and sharing to the app (PWA)

- The app is installable (manifest + service worker). Once installed on
  Android, it appears in the system Share menu: the share opens a form with
  title, notes, due date, priority and target list. The target list defaults
  to the one last used. (iOS doesn't support share targets: see `docs/ios-share.md` for an Apple
  Shortcut that opens the same form.) A link shared inside the text is
  extracted, and signing in first doesn't lose what was shared.
- When a link is shared, the app looks the page up (Open Graph tags, then the
  page title) and pre-fills the form without overwriting anything you typed:
  the title keeps the link followed by the page's title cut to 80 characters,
  and the notes repeat the full page title and its description. Pages that block bots or need a login (many
  Instagram, LinkedIn and Gmail links) give nothing, and the form stays as
  shared. The lookup only reaches public web addresses.

## Items by email

- Mail to `me@<domain>` (the site's domain) adds an item to the sender's Inbox.
  Mail to `<name>@<domain>` adds an item to that list. A list has an address
  only once its **owner** switches it on in the list settings and picks the
  name (3–32 characters: lowercase letters, digits, `.`, `_`, `-`; unique across
  all lists; some names such as `me` and `postmaster` are reserved). Turning it
  off, or deleting the list, frees the name.
- Only the right sender is accepted: a registered, enabled, non-guest user for
  `me@`, and a **member of the list** for a list address. The mail must pass
  DMARC (so the From address can't be forged) and the spam and virus scans, and
  a sender can send 30 mails an hour.
- **Everything else fails silently**: no bounce, no reply, so a sender can't
  tell an unknown list from an unauthorised sender.
- The subject (without `Fwd:`/`Re:`) is the title and the plain-text body the
  notes; with no subject, the first line of the body is the title. Attachments
  and HTML are ignored. If the title is just a link and there are no notes, the
  link is looked up and the item is formatted as for a shared link.
- Senders whose mail provider doesn't publish a DMARC policy are not accepted.
  Gmail, Outlook and iCloud do.

## Other sender addresses

- Someone can add other addresses they send from (a work mailbox, say) on the
  Account page, up to 5. Mail from a verified address is treated exactly as
  mail from the person's own address: the same `me@`, the same lists.
- An address has a state: **pending** (added; a code is shown, valid for 24
  hours), **expired** (the code ran out; ask for a new one) or **verified**
  (active). Removing it at any time ends it.
- To verify, send a mail **from that address** to `me@<domain>` with the code
  in the subject. Because the mail must pass the same DMARC check, this proves
  the person controls the address. The verification mail creates no item.
- An address can't be anyone's own sign-in address or another person's verified
  address, and every refusal gives the same answer, so it doesn't reveal who is
  registered. Several people may hold a pending claim on the same address; only
  the one who proves control gets it.
- Senders are assumed to pass DMARC. Automated systems that don't are not
  supported.

## Voice

- A mic button next to the add box dictates an item (where the browser
  supports speech recognition; it is hidden otherwise). It listens until you tap
  it again (it shows a stop icon meanwhile), however long you pause; stopping
  only ends the dictation, you then check the text and add it. The title is the first
  80 characters cut at a whole word. When it had to be cut, the full text goes
  into the notes. It listens in the phone's language.
