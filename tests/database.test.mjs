import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  for (let n = 1; n <= 50; n++) await db.query('insert into auth.users values ($1, $2, now())', [uid(n), `person${n}@example.com`]);
  await db.exec(await readFile(new URL('../supabase/migrations/202609140001_campaign.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202609140002_simple_access.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202609150003_public_names_and_cancel.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/202609150004_colombia_last_week_tuesday.sql', import.meta.url), 'utf8'));
  for (let n = 1; n <= 50; n++) await asUser(n, 'select public.maintenance_enter($1,$2)', ['Persona de prueba', `person${n}@gea.com`]);
});
beforeEach(async () => { await db.exec('delete from public.maintenance_reservations; delete from public.maintenance_admins'); });
after(async () => { await db.close(); });

async function asUser(n, sql, params = [], role = 'authenticated') {
  return db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [n ? uid(n) : '']);
    await tx.exec(`set local role ${role}`);
    return tx.query(sql, params);
  });
}
const reserve = (person, slot, name = 'Persona de prueba') => asUser(person, 'select public.maintenance_reserve($1, $2) as id', [slot, name]);

test('40 slots, exact dates, local times and 15-minute duration', async () => {
  const { rows } = await db.query(`select country, count(*)::integer as count,
    array_agg(distinct (starts_at at time zone case country when 'MX' then 'America/Mexico_City' else 'America/Bogota' end)::date::text) as dates,
    array_agg(distinct (starts_at at time zone case country when 'MX' then 'America/Mexico_City' else 'America/Bogota' end)::time::text) as times,
    bool_and(ends_at - starts_at = interval '15 minutes') as duration
    from public.maintenance_slots group by country order by country`);
  assert.deepEqual(rows.map(r => [r.country, r.count]), [['CO', 20], ['MX', 20]]);
  assert.deepEqual(rows[0].dates, ['2026-09-21', '2026-09-23', '2026-09-28', '2026-09-29']);
  assert.deepEqual(rows[1].dates, ['2026-09-21', '2026-09-22', '2026-09-28', '2026-09-29']);
  for (const row of rows) { assert.ok(row.duration); assert.deepEqual(row.times, ['09:00:00','09:30:00','10:00:00','10:30:00','11:00:00']); }
});

test('anonymous visitors see availability but cannot reserve or read personal data', async () => {
  const { rows } = await asUser(null, 'select * from public.maintenance_availability()', [], 'anon');
  assert.equal(rows.length, 40); assert.ok(rows.every(r => r.available));
  assert.deepEqual(Object.keys(rows[0]).sort(), ['available', 'country', 'ends_at', 'id', 'reserved_by', 'starts_at']);
  await assert.rejects(asUser(null, 'select public.maintenance_reserve(1, $1)', ['Persona'], 'anon'), /permission denied/);
  await assert.rejects(asUser(null, 'select * from public.maintenance_reservations', [], 'anon'), /permission denied/);
});

test('one reservation per person across countries; a repeat confirmation is idempotent', async () => {
  const first = await reserve(1, 1);
  assert.deepEqual((await reserve(1, 1)).rows, first.rows);
  await assert.rejects(reserve(1, 21), /ALREADY_BOOKED/);
  assert.equal((await db.query('select * from public.maintenance_reservations')).rows.length, 1);
});

test('two people cannot occupy the same slot; another slot remains available', async () => {
  await reserve(1, 1);
  await assert.rejects(reserve(2, 1), /SLOT_TAKEN/);
  await reserve(2, 2);
  const { rows } = await asUser(null, 'select * from public.maintenance_availability()', [], 'anon');
  assert.equal(rows.filter(r => !r.available).length, 2);
  assert.equal(rows.filter(r => r.country === 'CO' && r.available).length, 20);
});

test('capacity is exhausted exactly at 20 per country', async () => {
  for (let n = 1; n <= 40; n++) await reserve(n, n);
  const { rows } = await asUser(null, 'select * from public.maintenance_availability()', [], 'anon');
  assert.equal(rows.filter(r => r.available).length, 0);
  await assert.rejects(reserve(41, 20), /SLOT_TAKEN/);
  await assert.rejects(reserve(41, 41), /INVALID_SLOT/);
  assert.equal((await db.query('select count(*)::integer as n from public.maintenance_reservations')).rows[0].n, 40);
});

test('personal information is isolated; admin role cannot be self-assigned', async () => {
  await reserve(1, 1, 'Ana López'); await reserve(2, 21, 'Luis Pérez');
  const { rows } = await asUser(1, 'select * from public.maintenance_my_reservation()');
  assert.equal(rows.length, 1); assert.equal(rows[0].full_name, 'Ana López'); assert.equal(rows[0].email, 'person1@gea.com');
  assert.equal((await asUser(3, 'select * from public.maintenance_my_reservation()')).rows.length, 0);
  await assert.rejects(asUser(1, 'select * from public.maintenance_admin_reservations()'), /NOT_ADMIN/);
  await assert.rejects(asUser(1, 'insert into public.maintenance_admins values ($1)', [uid(1)]), /permission denied/);
  await assert.rejects(asUser(1, 'select * from public.maintenance_reservations'), /permission denied/);
  await db.query('insert into public.maintenance_admins values ($1)', [uid(3)]);
  assert.equal((await asUser(3, 'select * from public.maintenance_admin_reservations()')).rows.length, 2);
});

test('session required, email confirmation unnecessary, names validated and tables protected', async () => {
  await assert.rejects(reserve(null, 1), /NOT_AUTHENTICATED/);
  await db.query('update auth.users set email_confirmed_at = null where id = $1', [uid(50)]);
  await reserve(50, 1);
  await assert.rejects(reserve(1, 1, '  '), /NAME_REQUIRED/);
  await assert.rejects(asUser(1, 'delete from public.maintenance_slots'), /permission denied/);
  await assert.rejects(asUser(1, 'insert into public.maintenance_slots values (41, $1, now(), now())', ['MX']), /permission denied/);
});

test('exact corporate domain required and identity cannot change', async () => {
  for (const email of ['ana@gmail.com', 'ana@gea.com.evil', 'ana@sub.gea.com', null]) {
    await assert.rejects(asUser(1, 'select public.maintenance_enter($1,$2)', ['Ana López', email]), /INVALID_DOMAIN/);
  }
  await asUser(1, 'select public.maintenance_enter($1,$2)', ['Ana López', ' PERSON1@GEA.COM ']);
  await assert.rejects(asUser(1, 'select public.maintenance_enter($1,$2)', ['Ana López', 'other@gea.com']), /IDENTITY_LOCKED/);
  assert.equal((await asUser(1, 'select * from public.maintenance_access()')).rows[0].email, 'person1@gea.com');
  await assert.rejects(asUser(1, 'select * from public.maintenance_visitors'), /permission denied/);
});

test('same email in a different session cannot reserve twice', async () => {
  await db.query('insert into auth.users values ($1, null, null)', [uid(51)]);
  await asUser(51, 'select public.maintenance_enter($1,$2)', ['Otra sesión', 'person1@gea.com']);
  await reserve(1, 1);
  await assert.rejects(reserve(51, 2), /EMAIL_ALREADY_BOOKED/);
  assert.equal((await asUser(51, 'select * from public.maintenance_my_reservation()')).rows.length, 0);
});

test('schedule shows reserved names without emails and owner can cancel', async () => {
  await reserve(1, 1, 'Ana López');
  const publicView = await asUser(null, 'select * from public.maintenance_availability() where id = 1', [], 'anon');
  assert.equal(publicView.rows[0].available, false);
  assert.equal(publicView.rows[0].reserved_by, 'Ana López');
  assert.equal('email' in publicView.rows[0], false);
  assert.equal((await asUser(1, 'select public.maintenance_cancel() as removed')).rows[0].removed, true);
  assert.equal((await asUser(1, 'select public.maintenance_cancel() as removed')).rows[0].removed, false);
  assert.equal((await asUser(null, 'select available from public.maintenance_availability() where id = 1', [], 'anon')).rows[0].available, true);
  await assert.rejects(asUser(null, 'select public.maintenance_cancel()', [], 'anon'), /permission denied/);
});

test('past appointments cannot be reserved and are shown as unavailable', async () => {
  await db.exec("update public.maintenance_slots set starts_at = now() - interval '1 day', ends_at = now() - interval '1 day' + interval '15 minutes' where id = 40");
  try {
    await assert.rejects(reserve(1, 40), /PAST_SLOT/);
    const { rows } = await asUser(null, 'select * from public.maintenance_availability() where id = 40', [], 'anon');
    assert.equal(rows[0].available, false);
  } finally { await db.exec("update public.maintenance_slots set starts_at = '2026-09-29 11:00:00-05', ends_at = '2026-09-29 11:15:00-05' where id = 40"); }
});
