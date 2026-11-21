import { gql } from './graphqlClient';

export type Criticality = 'HIGH' | 'MEDIUM' | 'LOW';
export type Status = 'OPEN' | 'DONE';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export type Role = 'ADMIN' | 'USER' | 'GUEST';
export interface User { userId: string; email: string; displayName: string; role: Role; isAdmin: boolean; enabled: boolean }
export interface Folder { folderId: string; name: string }
export interface ListSummary {
  listId: string; name: string; ownerId: string; ownerName: string;
  isOwner: boolean; isInbox: boolean; folderId: string | null; memberCount: number; mailName: string | null; openCount: number;
}
export interface Member { userId: string; email: string; displayName: string; isOwner: boolean }
export interface Subitem { subitemId: string; title: string; status: Status }
export interface Item {
  itemId: string; listId: string; listName: string | null; title: string; notes: string | null; status: Status;
  dueDate: string | null; criticality: Criticality | null; recurringId: string | null;
  subitems: Subitem[]; createdAt: string; completedAt: string | null;
}
export interface Recurring {
  recurringId: string; title: string; targetListId: string; targetListName: string | null;
  frequency: Frequency; interval: number; weekday: number | null; dayOfMonth: number | null;
  startDate: string; nextDue: string; criticality: Criticality | null; active: boolean;
}
export interface LinkPreview { url: string; title: string | null; description: string | null; siteName: string | null }
export interface RecurringInput {
  title: string; targetListId: string; frequency: Frequency; interval: number;
  weekday?: number | null; dayOfMonth?: number | null; startDate: string;
  criticality?: Criticality | null; active?: boolean;
}

const USER = 'userId email displayName role isAdmin enabled';
const LIST = 'listId name ownerId ownerName isOwner isInbox folderId memberCount mailName openCount';
const MEMBER = 'userId email displayName isOwner';
const ITEM = `itemId listId listName title notes status dueDate criticality recurringId createdAt completedAt
  subitems { subitemId title status }`;
const RECURRING = `recurringId title targetListId targetListName frequency interval weekday dayOfMonth
  startDate nextDue criticality active`;

async function q<K extends string, T>(key: K, query: string, vars?: Record<string, unknown>): Promise<T> {
  return (await gql<Record<K, T>>(query, vars))[key];
}

export const api = {
  me: () => q<'me', User>('me', `query { me { ${USER} } }`),
  listUsers: () => q<'listUsers', User[]>('listUsers', `query { listUsers { ${USER} } }`),
  createUser: (email: string, displayName: string, role: Role) =>
    q<'createUser', { user: User; temporaryPassword: string }>(
      'createUser',
      `mutation($email:String!,$displayName:String!,$role:Role!){ createUser(email:$email,displayName:$displayName,role:$role){ user{${USER}} temporaryPassword } }`,
      { email, displayName, role }
    ),
  resetUserPassword: (userId: string) =>
    q<'resetUserPassword', { user: User; temporaryPassword: string }>(
      'resetUserPassword',
      `mutation($userId:ID!){ resetUserPassword(userId:$userId){ user{${USER}} temporaryPassword } }`,
      { userId }
    ),
  setUserEnabled: (userId: string, enabled: boolean) =>
    q<'setUserEnabled', User>(
      'setUserEnabled',
      `mutation($userId:ID!,$enabled:Boolean!){ setUserEnabled(userId:$userId,enabled:$enabled){ ${USER} } }`,
      { userId, enabled }
    ),

  setUserRole: (userId: string, role: Role) =>
    q<'setUserRole', User>(
      'setUserRole',
      `mutation($userId:ID!,$role:Role!){ setUserRole(userId:$userId,role:$role){ ${USER} } }`,
      { userId, role }
    ),

  listFolders: () => q<'listFolders', Folder[]>('listFolders', `query { listFolders { folderId name } }`),
  createFolder: (name: string) =>
    q<'createFolder', Folder>('createFolder', `mutation($name:String!){ createFolder(name:$name){ folderId name } }`, { name }),
  renameFolder: (folderId: string, name: string) =>
    q<'renameFolder', Folder>(
      'renameFolder',
      `mutation($folderId:ID!,$name:String!){ renameFolder(folderId:$folderId,name:$name){ folderId name } }`,
      { folderId, name }
    ),
  deleteFolder: (folderId: string) =>
    q<'deleteFolder', boolean>('deleteFolder', `mutation($folderId:ID!){ deleteFolder(folderId:$folderId) }`, { folderId }),

  listLists: () => q<'listLists', ListSummary[]>('listLists', `query { listLists { ${LIST} } }`),
  createList: (name: string, folderId?: string | null) =>
    q<'createList', ListSummary>(
      'createList',
      `mutation($name:String!,$folderId:ID){ createList(name:$name,folderId:$folderId){ ${LIST} } }`,
      { name, folderId }
    ),
  renameList: (listId: string, name: string) =>
    q<'renameList', ListSummary>(
      'renameList',
      `mutation($listId:ID!,$name:String!){ renameList(listId:$listId,name:$name){ ${LIST} } }`,
      { listId, name }
    ),
  deleteList: (listId: string) =>
    q<'deleteList', boolean>('deleteList', `mutation($listId:ID!){ deleteList(listId:$listId) }`, { listId }),
  setListMailName: (listId: string, name: string | null) =>
    q<'setListMailName', ListSummary>(
      'setListMailName',
      `mutation($listId:ID!,$name:String){ setListMailName(listId:$listId,name:$name){ ${LIST} } }`,
      { listId, name }
    ),
  mailDomain: () => q<'mailDomain', string | null>('mailDomain', `query { mailDomain }`),
  moveList: (listId: string, folderId: string | null) =>
    q<'moveList', ListSummary>(
      'moveList',
      `mutation($listId:ID!,$folderId:ID){ moveList(listId:$listId,folderId:$folderId){ ${LIST} } }`,
      { listId, folderId }
    ),
  listMembers: (listId: string) =>
    q<'listMembers', Member[]>('listMembers', `query($listId:ID!){ listMembers(listId:$listId){ ${MEMBER} } }`, { listId }),
  shareList: (listId: string, email: string) =>
    q<'shareList', Member[]>(
      'shareList',
      `mutation($listId:ID!,$email:String!){ shareList(listId:$listId,email:$email){ ${MEMBER} } }`,
      { listId, email }
    ),
  unshareList: (listId: string, userId: string) =>
    q<'unshareList', boolean>(
      'unshareList',
      `mutation($listId:ID!,$userId:ID!){ unshareList(listId:$listId,userId:$userId) }`,
      { listId, userId }
    ),

  listItems: (listId: string) =>
    q<'listItems', Item[]>('listItems', `query($listId:ID!){ listItems(listId:$listId){ ${ITEM} } }`, { listId }),
  listAgenda: () => q<'listAgenda', Item[]>('listAgenda', `query { listAgenda { ${ITEM} } }`),
  listPriority: () => q<'listPriority', Item[]>('listPriority', `query { listPriority { ${ITEM} } }`),
  createItem: (
    listId: string,
    title: string,
    dueDate?: string | null,
    criticality?: Criticality | null,
    notes?: string | null
  ) =>
    q<'createItem', Item>(
      'createItem',
      `mutation($listId:ID!,$title:String!,$notes:String,$dueDate:String,$criticality:Criticality){ createItem(listId:$listId,title:$title,notes:$notes,dueDate:$dueDate,criticality:$criticality){ ${ITEM} } }`,
      { listId, title, notes, dueDate, criticality }
    ),
  updateItem: (
    listId: string,
    itemId: string,
    patch: { title?: string; notes?: string | null; dueDate?: string | null; criticality?: Criticality | null }
  ) =>
    q<'updateItem', Item>(
      'updateItem',
      `mutation($listId:ID!,$itemId:ID!,$patch:ItemPatch!){ updateItem(listId:$listId,itemId:$itemId,patch:$patch){ ${ITEM} } }`,
      { listId, itemId, patch }
    ),
  setItemStatus: (listId: string, itemId: string, status: Status) =>
    q<'setItemStatus', Item>(
      'setItemStatus',
      `mutation($listId:ID!,$itemId:ID!,$status:Status!){ setItemStatus(listId:$listId,itemId:$itemId,status:$status){ ${ITEM} } }`,
      { listId, itemId, status }
    ),
  moveItem: (listId: string, itemId: string, targetListId: string) =>
    q<'moveItem', Item>(
      'moveItem',
      `mutation($listId:ID!,$itemId:ID!,$targetListId:ID!){ moveItem(listId:$listId,itemId:$itemId,targetListId:$targetListId){ ${ITEM} } }`,
      { listId, itemId, targetListId }
    ),
  deleteItem: (listId: string, itemId: string) =>
    q<'deleteItem', boolean>(
      'deleteItem',
      `mutation($listId:ID!,$itemId:ID!){ deleteItem(listId:$listId,itemId:$itemId) }`,
      { listId, itemId }
    ),
  addSubitem: (listId: string, itemId: string, title: string) =>
    q<'addSubitem', Item>(
      'addSubitem',
      `mutation($listId:ID!,$itemId:ID!,$title:String!){ addSubitem(listId:$listId,itemId:$itemId,title:$title){ ${ITEM} } }`,
      { listId, itemId, title }
    ),
  setSubitemStatus: (listId: string, itemId: string, subitemId: string, status: Status) =>
    q<'setSubitemStatus', Item>(
      'setSubitemStatus',
      `mutation($listId:ID!,$itemId:ID!,$subitemId:ID!,$status:Status!){ setSubitemStatus(listId:$listId,itemId:$itemId,subitemId:$subitemId,status:$status){ ${ITEM} } }`,
      { listId, itemId, subitemId, status }
    ),
  deleteSubitem: (listId: string, itemId: string, subitemId: string) =>
    q<'deleteSubitem', Item>(
      'deleteSubitem',
      `mutation($listId:ID!,$itemId:ID!,$subitemId:ID!){ deleteSubitem(listId:$listId,itemId:$itemId,subitemId:$subitemId){ ${ITEM} } }`,
      { listId, itemId, subitemId }
    ),

  linkPreview: (url: string) =>
    q<'linkPreview', LinkPreview>(
      'linkPreview',
      `query($url:String!){ linkPreview(url:$url){ url title description siteName } }`,
      { url }
    ),

  listRecurring: () => q<'listRecurring', Recurring[]>('listRecurring', `query { listRecurring { ${RECURRING} } }`),
  createRecurring: (input: RecurringInput) =>
    q<'createRecurring', Recurring>(
      'createRecurring',
      `mutation($input:RecurringInput!){ createRecurring(input:$input){ ${RECURRING} } }`,
      { input }
    ),
  updateRecurring: (recurringId: string, input: RecurringInput) =>
    q<'updateRecurring', Recurring>(
      'updateRecurring',
      `mutation($recurringId:ID!,$input:RecurringInput!){ updateRecurring(recurringId:$recurringId,input:$input){ ${RECURRING} } }`,
      { recurringId, input }
    ),
  deleteRecurring: (recurringId: string) =>
    q<'deleteRecurring', boolean>(
      'deleteRecurring',
      `mutation($recurringId:ID!){ deleteRecurring(recurringId:$recurringId) }`,
      { recurringId }
    ),
};
