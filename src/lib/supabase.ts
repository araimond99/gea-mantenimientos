import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const configured = Boolean(url && key);
export const registrationOpen = configured && import.meta.env.VITE_REGISTRATION_ENABLED !== 'false';
export const supabase = configured ? createClient(url!, key!) : null;

export function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  if (message.includes('INVALID_DOMAIN')) return 'Usa un correo que termine exactamente en @gea.com.';
  if (message.includes('EMAIL_ALREADY_BOOKED')) return 'Ese correo ya tiene una reserva. Consúltala en el navegador donde la hiciste o contacta a Soporte TI.';
  if (message.includes('IDENTITY_LOCKED')) return 'Cierra la sesión antes de entrar con otro correo.';
  if (message.includes('SLOT_TAKEN')) return 'Alguien acaba de reservar este horario. Elige otro disponible.';
  if (message.includes('ALREADY_BOOKED')) return 'Ya tienes una reserva para esta campaña. Puedes verla en Mi reserva.';
  if (message.includes('PAST_SLOT')) return 'Este horario ya pasó. Elige una fecha disponible.';
  if (message.includes('NAME_REQUIRED')) return 'Escribe tu nombre completo para confirmar.';
  if (message.includes('NOT_AUTHENTICATED')) return 'Inicia sesión y vuelve a intentar.';
  if (message.includes('NOT_ADMIN')) return 'Esta cuenta no tiene acceso a la administración.';
  if (message.includes('Invalid login credentials')) return 'El correo o la contraseña no coinciden.';
  if (message.includes('Email not confirmed')) return 'Confirma tu correo antes de iniciar sesión. Revisa también la carpeta de spam.';
  if (/rate limit|too many requests/i.test(message)) return 'Hay demasiados intentos. Espera unos minutos y vuelve a intentar.';
  if (/already registered/i.test(message)) return 'Este correo ya está registrado. Inicia sesión.';
  if (/fetch|network/i.test(message)) return 'No pudimos conectar. Revisa tu conexión y vuelve a intentar.';
  return 'No pudimos completar la operación. Inténtalo de nuevo; si continúa, contacta al administrador.';
}
