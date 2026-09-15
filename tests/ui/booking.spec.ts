import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { initialSlots } from '../../src/lib/schedule';

async function mockService(page: Page) {
  const slots = initialSlots();
  let reservation: Record<string, unknown> | null = null;
  let profile: { full_name: string; email: string } | null = null;
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', is_anonymous: true, user_metadata: {}, app_metadata: {}, created_at: '2026-09-15T12:00:00Z' };
  const accessToken = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`;
  await page.route('https://gea-test.supabase.co/**', async route => {
    const url = route.request().url();
    const ok = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/auth/v1/signup')) return ok({ access_token: accessToken, refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer', user });
    if (url.includes('/auth/v1/user')) return route.request().headers().authorization ? ok(user) : route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
    if (url.endsWith('/maintenance_availability')) return ok(slots);
    if (url.endsWith('/maintenance_my_reservation')) return ok(reservation ? [reservation] : []);
    if (url.endsWith('/maintenance_access')) return ok(profile ? [profile] : []);
    if (url.endsWith('/maintenance_enter')) { const d = route.request().postDataJSON(); profile = { full_name: d.p_full_name, email: d.p_email }; return ok(null); }
    if (url.endsWith('/maintenance_reserve')) {
      const d = route.request().postDataJSON(); const slot = slots.find(s => s.id === d.p_slot_id)!;
      slot.available = false; slot.reserved_by = profile!.full_name;
      reservation = { ...slot, id: '10000000-0000-4000-8000-000000000001', slot_id: slot.id, full_name: profile!.full_name, email: profile!.email, created_at: new Date().toISOString() };
      return ok((reservation as { id: string }).id);
    }
    if (url.endsWith('/maintenance_cancel')) { if (reservation) { const slot = slots.find(s => s.id === reservation!.slot_id)!; slot.available = true; slot.reserved_by = null; } reservation = null; return ok(true); }
    throw new Error(`Unmocked request: ${url}`);
  });
}

test('single-screen booking shows the name and supports cancellation', async ({ page }) => {
  await mockService(page); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Elige tu horario' })).toBeVisible();
  await expect(page.getByText('Registrarme')).toHaveCount(0);
  await expect(page.getByText('Ya tengo cuenta')).toHaveCount(0);
  await page.getByRole('button', { name: /09:00–09:15 Disponible/ }).first().click();
  await page.getByLabel('Nombre completo').fill('Ana López');
  await page.getByLabel('Correo GEA').fill('ana@gea.com');
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByText('Listo, tu horario quedó reservado.')).toBeVisible();
  await expect(page.getByRole('button', { name: /09:00–09:15 Ana López/ })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cancelar reserva' }).click();
  await expect(page.getByText('Tu reserva fue cancelada')).toBeVisible();
  await expect(page.getByRole('button', { name: /09:00–09:15 Disponible/ }).first()).toBeEnabled();
});

test('only exact gea.com emails are accepted', async ({ page }) => {
  await mockService(page); await page.goto('/');
  await page.getByRole('button', { name: /09:00–09:15 Disponible/ }).first().click();
  await page.getByLabel('Nombre completo').fill('Ana López');
  await page.getByLabel('Correo GEA').fill('ana@gmail.com');
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByRole('alert')).toContainText('@gea.com');
});

test('mobile schedule has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mockService(page); await page.goto('/');
  await page.getByRole('button', { name: /Colombia/ }).click();
  await expect(page.getByText('Hora de Bogotá')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
