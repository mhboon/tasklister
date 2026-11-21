import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, queryAll } from './db';
import { getMembership, listItemRows } from './access';
import { putItem } from './items';
import { addDays, nextOccurrence } from './schedule';
import type { Criticality } from './types';

export interface RecurringRow {
  ownerId: string;
  recurringId: string;
  title: string;
  targetListId: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  weekday?: number;
  dayOfMonth?: number;
  startDate: string;
  nextDue: string;
  criticality?: Criticality;
  active: boolean;
  createdAt: string;
}

/**
 * If the recurring item is due (nextDue <= today): create the item in the
 * target list unless a previous one from the same recurrence is still
 * open, then move nextDue to the first occurrence after today. A skipped
 * occurrence is not made up later. Returns whether an item was created.
 */
export async function materialize(rec: RecurringRow, today: string): Promise<boolean> {
  if (!rec.active || rec.nextDue > today) return false;

  let created = false;
  // The owner must still have access to the target list.
  if (await getMembership(rec.ownerId, rec.targetListId)) {
    const rows = await listItemRows(rec.targetListId);
    const stillOpen = rows.some((r) => !r.parentId && r.recurringId === rec.recurringId && r.status === 'OPEN');
    if (!stillOpen) {
      await putItem({
        listId: rec.targetListId,
        title: rec.title,
        dueDate: rec.nextDue,
        criticality: rec.criticality,
        recurringId: rec.recurringId,
      });
      created = true;
    }
  }

  const nextDue = nextOccurrence(rec, addDays(today, 1));
  await ddb.send(
    new UpdateCommand({
      TableName: tables.recurring,
      Key: { ownerId: rec.ownerId, recurringId: rec.recurringId },
      UpdateExpression: 'SET nextDue = :n',
      ConditionExpression: 'nextDue = :old', // another run already advanced it
      ExpressionAttributeValues: { ':n': nextDue, ':old': rec.nextDue },
    })
  ).catch((e) => {
    if (e.name !== 'ConditionalCheckFailedException') throw e;
  });
  rec.nextDue = nextDue;
  return created;
}

export const allRecurringFor = (ownerId: string) =>
  queryAll<RecurringRow>({
    TableName: tables.recurring,
    KeyConditionExpression: 'ownerId = :o',
    ExpressionAttributeValues: { ':o': ownerId },
  });
