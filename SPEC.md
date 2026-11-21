# Tasklister — Spec

A personal/family to-do app for browser (laptop and phone). Served at
`https://lists.mboapps.click`.

## People and access

- Sign-in is email + password. **Only users an admin has created can sign in**;
  there is no self sign-up and no self-service password recovery.
- An admin creates a user (name, email, optionally admin). Nothing is emailed:
  the admin gets a one-time temporary password to pass on, and the user
  must choose their own at first sign-in. Admins can also reset a password and
  disable/re-enable a user, except that an admin can't disable or reset the
  password of another admin.
- Google sign-in via Cognito is planned, not built. When added, it must only
  admit emails that already exist as users.

## Lists, folders, sharing

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
  lists to the top level; it never deletes lists.
- Lists are sorted alphabetically (case-insensitive), with the Inbox pinned first.
  Folders are sorted alphabetically too and shown below the top-level lists.
  All alphabetical sorting is case-insensitive.
- Each list shows its number of **open items** (not the number of shares).
- In a list view, a settings (⚙) button holds rename, share, move to folder
  and delete/leave. Sharing picks from registered users.

## Items

- An item has a title, optional **notes** (longer text), optional **due date**, optional **criticality**
  (High / Medium / Low), and is open or completed (completed can be undone).
- An item can have **subitems**, each open or completed. Subitems have only a
  title and status.
- Removing an item asks for confirmation and takes its subitems with it.
- URLs in an item's title are clickable and open in a new tab.
- Item delete is a trash icon, shown only when the item is opened.
- Open items are sorted per list: Inbox newest first, other lists A–Z. The
  user can switch to A–Z/Z–A, newest/oldest, priority or due date; the choice
  is remembered per user (in the browser). Completed ones are collapsed below.

## Recurring items

- A recurring item is its own thing: name, **schedule**, **target list**,
  optional criticality. Schedule = every N days / weeks (on a weekday) /
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
- **Priority:** open items that have a criticality, across all your lists,
  grouped High / Medium / Low. Items **without** a criticality are not shown.
- Agenda groups are sorted A–Z within a day; Priority groups A–Z within a
  level; recurring items are sorted A–Z.
- Both let you complete, edit and delete items in place.

## Interpretations worth checking

- "Items with criticality are not shown" in Priority was read as *without*.
- Completed items are excluded from Agenda and Priority.
- Subitems are removed without a confirmation prompt; items ask.

## Installing and sharing to the app (PWA)

- The app is installable (manifest + service worker). Once installed on
  Android, it appears in the system Share menu: the share opens a form with
  title, notes, due date, priority and target list. The target list defaults
  to the one last used. (iOS doesn't support share targets.)
