import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react';
import { configured, friendlyError, supabase } from './lib/supabase';
import { countries, dateLabel, dayKey, initialSlots, timeLabel } from './lib/schedule';
import type { Country, Reservation, Slot } from './lib/schedule';

export default function App() {
  const [country, setCountry] = useState<Country>('MX');
  const [slots, setSlots] = useState<Slot[]>(configured ? [] : initialSlots());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(configured);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [schedule, mine, access] = await Promise.all([
      supabase.rpc('maintenance_availability'),
      supabase.rpc('maintenance_my_reservation'),
      supabase.rpc('maintenance_access'),
    ]);
    if (schedule.error) setError('No pudimos cargar los horarios. Inténtalo de nuevo.');
    else setSlots(schedule.data as Slot[]);
    if (!mine.error) setReservation(mine.data?.[0] ?? null);
    if (!access.error && access.data?.[0]) {
      setName(access.data[0].full_name);
      setEmail(access.data[0].email);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const countrySlots = slots.filter(slot => slot.country === country);
  const days = useMemo(() => [...new Set(countrySlots.map(dayKey))], [countrySlots]);
  const selected = slots.find(slot => slot.id === selectedId && slot.available);
  const available = countrySlots.filter(slot => slot.available).length;

  async function reserve() {
    if (!supabase || !selected || busy) return;
    const corporateEmail = email.trim().toLowerCase();
    setError(''); setMessage('');
    if (name.trim().length < 2) return setError('Escribe tu nombre completo.');
    if (!/^[a-z0-9._%+-]+@gea\.com$/.test(corporateEmail)) return setError('Usa un correo que termine exactamente en @gea.com.');
    setBusy(true);
    try {
      let { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const signed = await supabase.auth.signInAnonymously();
        if (signed.error) throw signed.error;
        user = signed.data.user;
      }
      if (!user) throw new Error('NOT_AUTHENTICATED');
      const entered = await supabase.rpc('maintenance_enter', { p_full_name: name.trim(), p_email: corporateEmail });
      if (entered.error) throw entered.error;
      const booked = await supabase.rpc('maintenance_reserve', { p_slot_id: selected.id, p_full_name: name.trim() });
      if (booked.error) throw booked.error;
      setSelectedId(null);
      setMessage('Listo, tu horario quedó reservado.');
      await refresh();
    } catch (caught) {
      setError(friendlyError(caught));
      await refresh();
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!supabase || !reservation || busy) return;
    if (!window.confirm('¿Cancelar tu reserva y liberar este horario?')) return;
    setBusy(true); setError(''); setMessage('');
    const result = await supabase.rpc('maintenance_cancel');
    if (result.error) setError(friendlyError(result.error));
    else { setReservation(null); setMessage('Tu reserva fue cancelada y el horario volvió a estar disponible.'); }
    await refresh();
    setBusy(false);
  }

  return <div className="app-shell">
    <header className="topbar">
      <img src="/gea-logo.png" alt="GEA" className="gea-logo" />
      <span>Mantenimiento preventivo · Septiembre 2026</span>
    </header>

    <main className="main">
      <section className="intro">
        <div><p className="kicker">RESERVA EN 1 MINUTO</p><h1>Elige tu horario</h1><p>Cada mantenimiento dura 15 minutos. Todos pueden ver qué espacios siguen libres y quién reservó los demás.</p></div>
        <div className="country-tabs" role="group" aria-label="País">
          {(['MX', 'CO'] as Country[]).map(code => <button key={code} className={country === code ? 'active' : ''} onClick={() => { setCountry(code); setSelectedId(null); setError(''); }} aria-pressed={country === code}>
            {countries[code].name}<small>{countries[code].days}</small>
          </button>)}
        </div>
      </section>

      {message && <div className="message success" role="status"><Check size={18} />{message}</div>}
      {error && <div className="message error" role="alert">{error}</div>}

      {reservation && <section className="my-booking">
        <div><span>Tu reserva</span><strong>{dateLabel(reservation.starts_at, reservation.country, { weekday: 'long', day: 'numeric', month: 'long' })}, {timeLabel(reservation.starts_at, reservation.country)}–{timeLabel(reservation.ends_at, reservation.country)}</strong><small>{countries[reservation.country].name} · {reservation.full_name}</small></div>
        <button className="cancel-button" onClick={cancel} disabled={busy}><Trash2 size={17} /> Cancelar reserva</button>
      </section>}

      <div className="layout">
        <section className="schedule" aria-label={`Horarios de ${countries[country].name}`}>
          <div className="schedule-head"><div><h2>{countries[country].name}</h2><p>Hora de {countries[country].zoneLabel}</p></div><span className="counter"><strong>{loading ? '—' : available}</strong> de 20 disponibles</span></div>
          {loading ? <div className="loading"><LoaderCircle className="spin" /> Cargando horarios…</div> : <div className="day-grid">
            {days.map(day => {
              const daySlots = countrySlots.filter(slot => dayKey(slot) === day);
              const first = daySlots[0];
              return <article className="day-column" key={day}>
                <div className="day-title"><span>{dateLabel(first.starts_at, country, { weekday: 'long' })}</span><strong>{dateLabel(first.starts_at, country, { day: 'numeric' })}</strong><small>septiembre</small></div>
                <div className="slot-list">{daySlots.map(slot => <button key={slot.id} disabled={!slot.available || Boolean(reservation)} aria-pressed={selectedId === slot.id} className={`slot ${slot.available ? 'free' : 'taken'} ${selectedId === slot.id ? 'selected' : ''}`} onClick={() => setSelectedId(slot.id)}>
                  <span className="slot-time"><Clock3 size={15} />{timeLabel(slot.starts_at, country)}–{timeLabel(slot.ends_at, country)}</span>
                  {slot.available ? <small>Disponible</small> : <strong title={slot.reserved_by ?? ''}>{slot.reserved_by ?? 'Reservado'}</strong>}
                </button>)}</div>
              </article>;
            })}
          </div>}
          {!loading && <button className="refresh-button" onClick={() => void refresh()}><RefreshCw size={15} /> Actualizar espacios</button>}
        </section>

        <aside className="booking-form">
          <div className="form-heading"><CalendarDays size={21} /><div><h2>Reserva este espacio</h2><p>{selected ? `${dateLabel(selected.starts_at, country, { weekday: 'long', day: 'numeric', month: 'long' })} · ${timeLabel(selected.starts_at, country)}` : 'Primero selecciona un horario disponible.'}</p></div></div>
          <label>Nombre completo<input value={name} onChange={event => setName(event.target.value)} placeholder="Nombre y apellido" maxLength={120} disabled={busy || Boolean(reservation)} /></label>
          <label>Correo GEA<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="nombre@gea.com" maxLength={254} disabled={busy || Boolean(reservation)} /></label>
          <button className="reserve-button" onClick={reserve} disabled={!configured || !selected || busy || Boolean(reservation)}>{busy ? <><LoaderCircle className="spin" size={18} /> Guardando…</> : 'Confirmar reserva'}</button>
          <p className="form-note">Sin contraseña ni confirmación por correo. Una reserva por persona.</p>
        </aside>
      </div>
    </main>
    <footer>GEA · Soporte TI México y Colombia</footer>
  </div>;
}
