import { PutCommand, DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables, newId, nowIso, batchGet, TIME_ZONE, UserError } from '../../shared/db';
import { requireAdmin, requireMember } from '../../shared/access';
import { materialize, allRecurringFor, type RecurringRow } from '../../shared/recurring-run';
import { nextOccurrence, maxDate, todayIn, validateSchedule, type Schedule } from '../../shared/schedule';
import { cleanName, cleanCriticality } from '../../shared/validate';
import type { Ctx, ListRow } from '../../shared/types';

interface Input {
  title: string;
  targetListId: string;
  frequency: Schedule['frequency'];
  interval: number;
  weekday?: number | null;
  dayOfMonth?: number | null;
  startDate: string;
  criticality?: string | null;
  active?: boolean | null;
}

const dto = (r: RecurringRow, listNames: Map<string, string>) => ({
  recurringId: r.recurringId,
  title: r.title,
  targetListId: r.targetListId,
  targetListName: listNames.get(r.targetListId) ?? null,
  frequency: r.frequency,
  interval: r.interval,
  weekday: r.weekday ?? null,
  dayOfMonth: r.dayOfMonth ?? null,
  startDate: r.startDate,
  nextDue: r.nextDue,
  criticality: r.criticality ?? null,
  active: r.active,
});

async function listNamesFor(ids: string[]): Promise<Map<string, string>> {
  const lists = await batchGet<ListRow>(tables.lists, [...new Set(ids)].map((listId) => ({ listId })));
  return new Map(lists.map((l) => [l.listId, l.name]));
}

async function build(ctx: Ctx, recurringId: string, input: Input, createdAt: string): Promise<RecurringRow> {
  await requireMember(ctx, input.targetListId);
  const schedule: Schedule = {
    frequency: input.frequency,
    interval: input.interval,
    weekday: input.frequency === 'WEEKLY' ? input.weekday : null,
    dayOfMonth: input.frequency === 'MONTHLY' ? input.dayOfMonth : null,
    startDate: input.startDate,
  };
  validateSchedule(schedule);
  const today = todayIn(TIME_ZONE);
  const row: RecurringRow = {
    ownerId: ctx.userId,
    recurringId,
    title: cleanName(input.title, 'Title', 200),
    targetListId: input.targetListId,
    frequency: schedule.frequency,
    interval: schedule.interval,
    weekday: schedule.weekday ?? undefined,
    dayOfMonth: schedule.dayOfMonth ?? undefined,
    startDate: schedule.startDate,
    // First occurrence from today on, so a past start date never
    // back-fills overdue items.
    nextDue: nextOccurrence(schedule, maxDate(today, schedule.startDate)),
    criticality: input.criticality ? cleanCriticality(input.criticality) : undefined,
    active: input.active ?? true,
    createdAt,
  };
  await ddb.send(new PutCommand({ TableName: tables.recurring, Item: row }));
  // Due today? Create it now rather than waiting for tomorrow's run.
  await materialize(row, today);
  return row;
}

export async function listRecurring(ctx: Ctx) {
  requireAdmin(ctx);
  const rows = await allRecurringFor(ctx.userId);
  const names = await listNamesFor(rows.map((r) => r.targetListId));
  return rows.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })).map((r) => dto(r, names));
}

export async function createRecurring(ctx: Ctx, args: { input: Input }) {
  requireAdmin(ctx);
  const row = await build(ctx, newId(), args.input, nowIso());
  return dto(row, await listNamesFor([row.targetListId]));
}

export async function updateRecurring(ctx: Ctx, args: { recurringId: string; input: Input }) {
  requireAdmin(ctx);
  const existing = (
    await ddb.send(new GetCommand({ TableName: tables.recurring, Key: { ownerId: ctx.userId, recurringId: args.recurringId } }))
  ).Item as RecurringRow | undefined;
  if (!existing) throw new UserError('Recurring item not found.');
  const row = await build(ctx, args.recurringId, args.input, existing.createdAt);
  return dto(row, await listNamesFor([row.targetListId]));
}

export async function deleteRecurring(ctx: Ctx, args: { recurringId: string }) {
  requireAdmin(ctx);
  await ddb.send(new DeleteCommand({ TableName: tables.recurring, Key: { ownerId: ctx.userId, recurringId: args.recurringId } }));
  return true;
}
