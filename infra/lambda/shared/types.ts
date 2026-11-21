export type Criticality = 'HIGH' | 'MEDIUM' | 'LOW';
export type Status = 'OPEN' | 'DONE';

/** Guests only work in lists shared with them; users have a workspace of their own; admins also manage people. */
export type Role = 'ADMIN' | 'USER' | 'GUEST';

export interface Ctx {
  userId: string;
  email: string;
  role: Role;
  isAdmin: boolean;
}

export interface UserRow { userId: string; email: string; displayName: string; createdAt: string }
export interface FolderRow { ownerId: string; folderId: string; name: string }
export interface ListRow { listId: string; ownerId: string; name: string; isInbox?: boolean; createdAt: string }
export interface MemberRow { userId: string; listId: string; role: 'OWNER' | 'MEMBER'; folderId?: string }
export interface ItemRow {
  listId: string;
  /** Items: the item id. Subitems: `${itemId}#${subitemId}`. */
  itemId: string;
  parentId?: string;
  title: string;
  notes?: string;
  status: Status;
  dueDate?: string;
  criticality?: Criticality;
  recurringId?: string;
  createdAt: string;
  completedAt?: string;
}
