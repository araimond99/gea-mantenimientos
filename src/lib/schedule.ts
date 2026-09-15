export type Country = 'MX' | 'CO';
export type Slot = { id: number; country: Country; starts_at: string; ends_at: string; available: boolean; reserved_by?: string | null };
export type Reservation = { id: string; slot_id: number; full_name: string; email: string; created_at: string; country: Country; starts_at: string; ends_at: string };
export const countries = {
  MX: { name: 'México', days: 'Lunes y martes', zone: 'America/Mexico_City', zoneLabel: 'Ciudad de México', dates: [21, 22, 28, 29], offset: '-06:00' },
  CO: { name: 'Colombia', days: 'Lunes y miércoles', zone: 'America/Bogota', zoneLabel: 'Bogotá', dates: [21, 23, 28, 30], offset: '-05:00' },
} as const;
export const times = ['09:00', '09:30', '10:00', '10:30', '11:00'];
export function initialSlots(): Slot[] {
  return (Object.keys(countries) as Country[]).flatMap((country, ci) => countries[country].dates.flatMap((day, di) => times.map((time, ti) => {
    const starts = new Date(`2026-09-${day}T${time}:00${countries[country].offset}`);
    return { id: ci * 20 + di * 5 + ti + 1, country, starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 15 * 60_000).toISOString(), available: true };
  })));
}
export function dateLabel(value: string, country: Country, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('es-MX', { timeZone: countries[country].zone, ...options }).format(new Date(value));
}
export const timeLabel = (value: string, country: Country) => dateLabel(value, country, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const dayKey = (slot: Slot) => dateLabel(slot.starts_at, slot.country, { day: '2-digit', month: '2-digit', year: 'numeric' });
export function calendarFile(reservation: Reservation) {
  const stamp = (value: string) => value.replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}/, '');
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GEA//Mantenimientos//ES', 'BEGIN:VEVENT', `UID:${reservation.id}@gea-maintenance`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(new Date(reservation.starts_at).toISOString())}`, `DTEND:${stamp(new Date(reservation.ends_at).toISOString())}`, 'SUMMARY:Mantenimiento preventivo de computadora', `DESCRIPTION:Reserva confirmada en ${countries[reservation.country].name}. Duración: 15 minutos.`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'mantenimiento-gea.ics'; a.click(); URL.revokeObjectURL(url);
}
