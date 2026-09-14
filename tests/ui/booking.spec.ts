import { test, expect } from '@playwright/test';
import { initialSlots } from '../../src/lib/schedule';
import type { Page } from '@playwright/test';

async function mockService(page: Page, { admin = false, conflict = false, loginFailure = false } = {}) {
  const slots = initialSlots();
  let reservation: Record<string, unknown> | null = null;
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'ana@example.com', email_confirmed_at: '2026-09-14T12:00:00Z', user_metadata: { full_name: 'Ana López' }, app_metadata: {}, created_at: '2026-09-14T12:00:00Z' };
  const accessToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
  await page.route('https://gea-test.supabase.co/**', async route => {
    const url = route.request().url();
    const ok = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/auth/v1/token')) {
      if (loginFailure) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) });
      return ok({ access_token: accessToken, refresh_token: 'test-refresh-token', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user });
    }
    if (url.includes('/auth/v1/signup')) return ok({ user, session: null });
    if (url.includes('/auth/v1/user')) return ok(user);
    if (url.includes('/auth/v1/logout') || url.includes('/auth/v1/recover')) return ok({});
    if (url.endsWith('/maintenance_availability')) return ok(slots);
    if (url.endsWith('/maintenance_my_reservation')) return ok(reservation ? [reservation] : []);
    if (url.endsWith('/maintenance_is_admin')) return ok(admin);
    if (url.endsWith('/maintenance_admin_reservations')) return ok(reservation ? [reservation] : []);
    if (url.endsWith('/maintenance_reserve')) {
      const data = route.request().postDataJSON();
      const slot = slots.find(s => s.id === data.p_slot_id)!;
      slot.available = false;
      if (conflict) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'SLOT_TAKEN' }) });
      reservation = { ...slot, id: '00000000-1111-4444-8888-000000000001', slot_id: slot.id, full_name: data.p_full_name, email: user.email, created_at: new Date().toISOString() };
      return ok(reservation.id);
    }
    throw new Error(`Unmocked Supabase request: ${url}`);
  });
}
async function login(page: Page) {
  await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
  await page.getByLabel('Correo corporativo').fill('ana@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('testing-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Un horario que te quede bien' })).toBeVisible();
}

test('Mexico booking, persistent account lookup, calendar download and protected admin', async ({ page }) => {
  await mockService(page, { admin: true });
  const consoleErrors: string[] = []; page.on('pageerror', err => consoleErrors.push(err.message));
  await page.goto('/'); await login(page);
  await expect(page.getByRole('button', { name: /mar 22/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /mar 29/ })).toBeVisible();
  await page.getByRole('button', { name: /09:00 – 09:15/ }).click();
  await page.getByRole('button', { name: 'Revisar mi reserva' }).click();
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByText('RESERVA CONFIRMADA', { exact: true })).toBeVisible();
  await expect(page.getByText('Ana López', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Guardar en mi calendario' }).click();
  expect((await download).suggestedFilename()).toBe('mantenimiento-gea.ics');
  await page.reload(); await page.getByRole('button', { name: 'Mi reserva', exact: true }).click();
  await expect(page.getByText('RESERVA CONFIRMADA', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Administración', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Ana López ana@example.com' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Administración', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Correo corporativo')).toHaveValue('');
  expect(consoleErrors).toEqual([]);
});

test('mobile Colombia schedule, availability collision and no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockService(page, { conflict: true });
  await page.goto('/'); await page.getByRole('button', { name: /Colombia Lunes y miércoles/ }).click(); await login(page);
  await expect(page.getByRole('button', { name: /mié 23/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /mié 30/ })).toBeVisible();
  await expect(page.getByText('Hora de Bogotá', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: /09:30 – 09:45/ }).click();
  await page.getByRole('button', { name: 'Revisar mi reserva' }).click();
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByRole('alert')).toContainText('Alguien acaba de reservar');
  await expect(page.getByRole('button', { name: /09:30 – 09:45/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Administración', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-schedule.png', fullPage: true });
});

test('registration requires email confirmation and gives actionable message', async ({ page }) => {
  await mockService(page); await page.goto('/');
  await page.getByLabel('Nombre completo').fill('Ana López');
  await page.getByLabel('Correo corporativo').fill('ana@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('testing-password');
  await page.getByRole('button', { name: 'Registrarme y continuar' }).click();
  await expect(page.getByRole('status')).toContainText('Revisa tu correo');
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
});

test('login errors stay in the form and preserve email', async ({ page }) => {
  await mockService(page, { loginFailure: true }); await page.goto('/');
  await page.getByRole('button', { name: 'Ya tengo cuenta' }).click();
  await page.getByLabel('Correo corporativo').fill('ana@example.com');
  await page.getByLabel('Contraseña', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('El correo o la contraseña no coinciden');
  await expect(page.getByLabel('Correo corporativo')).toHaveValue('ana@example.com');
});

test('enlarged text stays within a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockService(page);
  await page.goto('/');
  await page.addStyleTag({ content: ':root { font-size: 32px !important; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await login(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
