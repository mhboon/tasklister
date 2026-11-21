import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, TIME_ZONE } from '../shared/db';
import { materialize, type RecurringRow } from '../shared/recurring-run';
import { todayIn } from '../shared/schedule';

/** Daily: creates every recurring item that is due and not already open. */
export async function handler(): Promise<{ checked: number; created: number }> {
  const today = todayIn(TIME_ZONE);
  let checked = 0;
  let created = 0;
  let key: Record<string, unknown> | undefined;
  do {
    // Small table (a person's routines), so a filtered Scan is fine.
    const res = await ddb.send(
      new ScanCommand({
        TableName: tables.recurring,
        FilterExpression: 'active = :t AND nextDue <= :today',
        ExpressionAttributeValues: { ':t': true, ':today': today },
        ExclusiveStartKey: key,
      })
    );
    for (const rec of (res.Items ?? []) as RecurringRow[]) {
      checked++;
      try {
        if (await materialize(rec, today)) created++;
      } catch (e) {
        // One broken recurrence must not block the others.
        console.error('recurring failed', rec.ownerId, rec.recurringId, e);
      }
    }
    key = res.LastEvaluatedKey;
  } while (key);
  console.log(JSON.stringify({ today, checked, created }));
  return { checked, created };
}
