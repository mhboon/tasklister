import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextOccurrence, validateSchedule, addDays, todayIn, type Schedule } from '../lambda/shared/schedule';

const weekly = (over: Partial<Schedule> = {}): Schedule => ({
  frequency: 'WEEKLY', interval: 1, weekday: 1, startDate: '2026-11-02', ...over, // 2026-11-02 is a Monday
});

test('weekly: same day counts as the next occurrence', () => {
  assert.equal(nextOccurrence(weekly(), '2026-11-09'), '2026-11-09');
});

test('weekly: rolls to the next matching weekday', () => {
  assert.equal(nextOccurrence(weekly(), '2026-11-10'), '2026-11-16');
});

test('weekly: never before startDate; anchors on first matching weekday', () => {
  // start on a Wednesday, want Mondays -> first is the following Monday
  assert.equal(nextOccurrence(weekly({ startDate: '2026-11-04' }), '2026-01-01'), '2026-11-09');
});

test('weekly every 2 weeks keeps its rhythm', () => {
  const s = weekly({ interval: 2 });
  assert.equal(nextOccurrence(s, '2026-11-03'), '2026-11-16');
  assert.equal(nextOccurrence(s, '2026-11-17'), '2026-11-30');
  assert.equal(nextOccurrence(s, '2026-11-30'), '2026-11-30');
});

test('daily every 3 days', () => {
  const s: Schedule = { frequency: 'DAILY', interval: 3, startDate: '2026-11-01' };
  assert.equal(nextOccurrence(s, '2026-11-01'), '2026-11-01');
  assert.equal(nextOccurrence(s, '2026-11-02'), '2026-11-04');
  assert.equal(nextOccurrence(s, '2026-11-05'), '2026-11-07');
});

test('monthly clamps to the end of short months', () => {
  const s: Schedule = { frequency: 'MONTHLY', interval: 1, dayOfMonth: 31, startDate: '2026-01-01' };
  assert.equal(nextOccurrence(s, '2026-02-01'), '2026-02-28');
  assert.equal(nextOccurrence(s, '2026-04-01'), '2026-04-30');
  assert.equal(nextOccurrence(s, '2028-02-01'), '2028-02-29');
});

test('monthly every 3 months, across a year boundary', () => {
  const s: Schedule = { frequency: 'MONTHLY', interval: 3, dayOfMonth: 15, startDate: '2026-11-01' };
  assert.equal(nextOccurrence(s, '2026-11-16'), '2027-02-15');
  assert.equal(nextOccurrence(s, '2027-02-16'), '2027-05-15');
});

test('monthly: startDate after the day-of-month skips to next month', () => {
  const s: Schedule = { frequency: 'MONTHLY', interval: 1, dayOfMonth: 5, startDate: '2026-11-20' };
  assert.equal(nextOccurrence(s, '2026-01-01'), '2026-12-05');
});

test('validation', () => {
  assert.throws(() => validateSchedule({ ...weekly(), weekday: 9 }));
  assert.throws(() => validateSchedule({ ...weekly(), interval: 0 }));
  assert.throws(() => validateSchedule({ ...weekly(), startDate: '2026-02-31' }));
  assert.throws(() => validateSchedule({ frequency: 'MONTHLY', interval: 1, startDate: '2026-01-01' }));
  assert.doesNotThrow(() => validateSchedule(weekly()));
});

test('addDays / todayIn', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  // 23:30 UTC on 1 Nov is already 2 Nov in Amsterdam
  assert.equal(todayIn('Europe/Amsterdam', new Date('2026-11-01T23:30:00Z')), '2026-11-02');
});
