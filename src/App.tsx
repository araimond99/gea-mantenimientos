import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { ArrowRight, ArrowLeft, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Download, Globe2, Info, LoaderCircle, LockKeyhole, LogOut, Monitor, RefreshCw, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { configured, friendlyError, supabase } from './lib/supabase';
import { calendarFile, countries, dateLabel, dayKey, initialSlots, timeLabel } from './lib/schedule';
import type { Country, Reservation, Slot } from './lib/schedule';

type View = 'booking' | 'mine' | 'admin';
type AuthMode = 'register' | 'login' | 'reset' | 'new-password';

function CountryFlag({ country }: { country: Country }) {
  return <span className={`flag flag-${country.toLowerCase()}`} aria-hidden="true">{country === 'MX' && <span>◆</span>}</span>;
}

export default function App() {
  const [country, setCountry] = useState<Country>('MX');
  const [slots, setSlots] = useState<Slot[]>(configured ? [] : initialSlots());
  const [loading, setLoading] = useState(configured);
  const [loadError, setLoadError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!configured);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<View>('booking');
  const [step, setStep] = useState(1);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('register');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [adminRows, setAdminRows] = useState<Reservation[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const requestGeneration = useRef(0);
  const countryInfo = countries[country];
  const countrySlots = slots.filter(s => s.country === country);
  const availableCount = countrySlots.filter(s => s.available).length;
  const days = [...new Set(countrySlots.map(dayKey))];
  const activeDay = days.includes(selectedDay) ? selectedDay : days[0];
  const daySlots = countrySlots.filter(s => dayKey(s) === activeDay);
  const selected = slots.find(s => s.id === selectedId && s.country === country);

  const refreshSlots = useCallback(async () => {
    if (!supabase) return;
    setLoadError('');
    const { data, error: rpcError } = await supabase.rpc('maintenance_availability');
    if (rpcError) setLoadError('No pudimos cargar la disponibilidad. Vuelve a intentar.');
    else setSlots(data as Slot[]);
    setLoading(false);
  }, []);

  const refreshAccount = useCallback(async () => {
    if (!supabase) return;
    const generation = ++requestGeneration.current;
    setAccountLoading(true); setAccountError('');
    const [mine, admin] = await Promise.all([supabase.rpc('maintenance_my_reservation'), supabase.rpc('maintenance_is_admin')]);
    if (generation !== requestGeneration.current) return;
    if (mine.error || admin.error) setAccountError('No pudimos consultar tu cuenta. Reintenta antes de reservar.');
    else { setReservation(mine.data?.[0] ?? null); setIsAdmin(admin.data === true); }
    setAccountLoading(false);
  }, []);

  useEffect(() => {
    void refreshSlots();
    const refresh = () => { if (document.visibilityState === 'visible') void refreshSlots(); };
    const interval = window.setInterval(refresh, 20_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, [refreshSlots]);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null); setAuthReady(true);
      if (event === 'PASSWORD_RECOVERY') { setAuthMode('new-password'); setStep(1); setView('booking'); }
      if (event === 'SIGNED_OUT') { setStep(1); setView('booking'); setSelectedId(null); setFullName(''); setEmail(''); setPassword(''); setAdminRows([]); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      setEmail(user.email ?? '');
      setFullName(user.user_metadata?.full_name || '');
      void refreshAccount();
    } else {
      requestGeneration.current++; setReservation(null); setIsAdmin(false); setAccountLoading(false); setAccountError('');
    }
  }, [user?.id, refreshAccount]);

  useEffect(() => {
    if (!selected?.available && selectedId !== null) { setSelectedId(null); if (step === 3) setStep(2); }
  }, [selected?.available, selectedId, step]);

  useEffect(() => {
    if (view !== 'admin' || !isAdmin || !supabase) return;
    let active = true;
    const load = async () => {
      setAdminLoading(true); setAdminError('');
      const { data, error: rpcError } = await supabase!.rpc('maintenance_admin_reservations');
      if (!active) return;
      if (rpcError) setAdminError(friendlyError(rpcError)); else setAdminRows(data as Reservation[]);
      setAdminLoading(false);
    };
    void load();
    const interval = window.setInterval(() => void load(), 20_000);
    return () => { active = false; clearInterval(interval); };
  }, [view, isAdmin]);

  function changeCountry(next: Country) {
    setCountry(next); setSelectedId(null); setSelectedDay(''); setError(''); if (step === 3) setStep(2);
  }
  function changeAuthMode(next: AuthMode) { setAuthMode(next); setError(''); setNotice(''); setPassword(''); }

  async function handleAuth(e: FormEvent) {
    e.preventDefault(); if (!supabase || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (authMode === 'register') {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin } });
        if (authError) throw authError;
        if (data.session) setStep(2);
        else { setNotice('Revisa tu correo y abre el enlace de confirmación. Después vuelve aquí e inicia sesión para elegir tu horario.'); setAuthMode('login'); }
      } else if (authMode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (authError) throw authError;
        setStep(2);
      } else if (authMode === 'reset') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin });
        if (authError) throw authError;
        setNotice('Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña.');
      } else {
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        setAuthMode('login'); setNotice('Tu contraseña se actualizó. Ya puedes continuar.'); setStep(2);
      }
      setPassword('');
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true); setError('');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(friendlyError(signOutError));
    else { setView('booking'); setStep(1); setSelectedId(null); setFullName(''); setEmail(''); setPassword(''); setNotice(''); setAdminRows([]); }
    setBusy(false);
  }

  async function book() {
    if (!supabase || !selected || !user || busy || accountLoading || accountError) return;
    setBusy(true); setError('');
    try {
      const { error: rpcError } = await supabase.rpc('maintenance_reserve', { p_slot_id: selected.id, p_full_name: fullName.trim() });
      if (rpcError) throw rpcError;
      await refreshAccount(); setView('mine'); setSelectedId(null); setStep(2);
      await refreshSlots();
    } catch (caught) { setError(friendlyError(caught)); await Promise.all([refreshSlots(), refreshAccount()]); }
    finally { setBusy(false); }
  }

  return <div className="app-shell">
    <header className="header"><a className="brand" href="/" aria-label="GEA, inicio"><span className="brand-mark">g<span>e</span>a<span className="brand-dot">.</span></span><span className="brand-divider" /><span className="brand-caption">Personas & tecnología</span></a>
      <nav aria-label="Navegación principal"><button className={view === 'booking' ? 'nav-link active' : 'nav-link'} onClick={() => { setView('booking'); setError(''); }}>Reservar</button>{user && <button className={view === 'mine' ? 'nav-link active' : 'nav-link'} onClick={() => setView('mine')}>Mi reserva</button>}{isAdmin && <button className={view === 'admin' ? 'nav-link active' : 'nav-link'} onClick={() => setView('admin')}>Administración</button>}</nav>
      {user ? <button className="account-button" onClick={signOut} disabled={busy} aria-label="Cerrar sesión"><span>{user.email}</span><LogOut size={17} /></button> : <span className="header-tag"><ShieldCheck size={16} /> Soporte TI</span>}
    </header>

    <main>
      <div className="page-heading"><div><p className="eyebrow"><span /> CAMPAÑA SEPTIEMBRE 2026</p><h1>{view === 'admin' ? 'Agenda de mantenimientos' : view === 'mine' ? 'Tu próxima cita' : 'Reserva tu mantenimiento'}</h1><p className="page-description">{view === 'admin' ? 'Consulta las reservas de México y Colombia en un solo lugar.' : 'Un espacio de 15 minutos para cuidar tu computadora.'}</p></div><div className="campaign-badge"><CalendarDays size={20} /><span>21 — 30 <small>SEPTIEMBRE</small></span></div></div>

      {!configured && <div className="preview-banner" role="status"><Info size={18} /><div><strong>Vista previa de la agenda.</strong> El registro y las reservas se habilitarán al conectar el servicio.</div></div>}

      {view === 'booking' && <>
        <div className="workspace">
          <aside className="sidebar">
            <div className="sidebar-title"><Globe2 size={18} /><h2>Elige tu país</h2></div>
            <div className="country-list" role="group" aria-label="País del mantenimiento">{(['MX', 'CO'] as Country[]).map(code => <button key={code} className={`country-card ${country === code ? 'selected' : ''}`} onClick={() => changeCountry(code)} aria-pressed={country === code} disabled={busy}>
              <CountryFlag country={code} /><span className="country-copy"><strong>{countries[code].name}</strong><small>{countries[code].days}</small></span><span className="radio-indicator">{country === code && <span />}</span>
            </button>)}</div>
            <div className="capacity"><div className="capacity-label"><span>Cupos disponibles</span><span className="capacity-pill">{countryInfo.name}</span></div><div className="capacity-number">{loading || loadError ? '—' : availableCount}<span> / 20</span></div><div className="capacity-track"><span style={{ width: `${loading || loadError ? 0 : availableCount * 5}%` }} /></div><p>{!configured ? '20 espacios previstos para esta sede.' : loadError ? 'Disponibilidad por confirmar.' : availableCount === 0 ? 'Los cupos de esta sede se han agotado.' : 'Las reservas se asignan por orden de confirmación.'}</p></div>
            <div className="visit-details"><h3>Antes de reservar</h3><div><Clock3 size={18} /><span><strong>15 minutos por equipo</strong><small>Jornada de 9:00 a 12:00</small></span></div><div><Globe2 size={18} /><span><strong>Hora de {countryInfo.zoneLabel}</strong><small>Todos los horarios son locales.</small></span></div><div><Monitor size={18} /><span><strong>Una cita por persona</strong><small>Para esta campaña de septiembre.</small></span></div></div>
            <div className="help-note"><Wrench size={17} /><p>Ten tu computadora lista a la hora de tu cita.</p></div>
          </aside>

          <section className="booking-panel" aria-label="Reserva de mantenimiento">
            <ol className="steps">{['Tus datos', 'Fecha y hora', 'Confirmación'].map((label, i) => <li key={label} className={step === i + 1 ? 'current' : step > i + 1 ? 'complete' : ''} aria-current={step === i + 1 ? 'step' : undefined}><span>{step > i + 1 ? <Check size={15} /> : `0${i + 1}`}</span><strong>{label}</strong>{i < 2 && <ChevronRight size={16} className="step-chevron" />}</li>)}</ol>

            <div className="panel-content">
              {step === 1 && <>
                <div className="section-heading"><span className="section-icon"><UserRound size={22} /></span><div><h2>{authMode === 'reset' ? 'Recupera tu acceso' : authMode === 'new-password' ? 'Crea una nueva contraseña' : user ? 'Todo listo para elegir tu cita' : 'Primero, cuéntanos quién eres'}</h2><p>{user && authMode !== 'new-password' ? 'Tu reserva quedará asociada a esta cuenta.' : 'Usa tu correo corporativo para identificar tu reserva.'}</p></div></div>
                {!authReady ? <Loading text="Consultando tu sesión…" /> : user && authMode !== 'new-password' ? <div className="signed-in"><div className="identity-card"><span className="avatar">{(fullName || user.email || 'U').charAt(0).toUpperCase()}</span><div><strong>{fullName || 'Tu cuenta'}</strong><p>{user.email}</p></div><CheckCircle2 size={21} /></div>{accountLoading ? <Loading text="Consultando tus reservas…" /> : accountError ? <Message type="error">{accountError}<button className="text-button" onClick={() => void refreshAccount()}>Reintentar</button></Message> : reservation ? <><Message type="notice">Ya tienes una cita confirmada en {countries[reservation.country].name}.</Message><button className="primary" onClick={() => setView('mine')}>Ver mi reserva <ArrowRight size={18} /></button></> : <button className="primary" onClick={() => setStep(2)}>Elegir fecha y hora <ArrowRight size={18} /></button>}</div> : <>
                  {(authMode === 'register' || authMode === 'login') && <div className="auth-tabs" role="group" aria-label="Acceso"><button aria-pressed={authMode === 'register'} className={authMode === 'register' ? 'selected' : ''} onClick={() => changeAuthMode('register')}>Registrarme</button><button aria-pressed={authMode === 'login'} className={authMode === 'login' ? 'selected' : ''} onClick={() => changeAuthMode('login')}>Ya tengo cuenta</button></div>}
                  <form className="auth-form" onSubmit={handleAuth}>
                    {authMode === 'register' && <label>Nombre completo<input name="full_name" autoComplete="name" placeholder="Escribe tu nombre y apellido" minLength={2} maxLength={120} value={fullName} onChange={e => setFullName(e.target.value)} required disabled={busy} /></label>}
                    {authMode !== 'new-password' && <label>Correo corporativo<input type="email" name="email" autoComplete="email" placeholder="nombre@empresa.com" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></label>}
                    {authMode !== 'reset' && <label>{authMode === 'new-password' ? 'Nueva contraseña' : 'Contraseña'}<input type="password" name="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder={authMode === 'login' ? 'Tu contraseña' : 'Al menos 8 caracteres'} minLength={authMode === 'login' ? 1 : 8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /></label>}
                    {authMode === 'login' && <button type="button" className="text-button forgot" onClick={() => changeAuthMode('reset')}>Olvidé mi contraseña</button>}
                    {error && <Message type="error">{error}</Message>}{notice && <Message type="notice">{notice}</Message>}
                    <button className="primary full-width" type="submit" disabled={!configured || busy}>{busy ? <><LoaderCircle size={18} className="spin" /> Un momento…</> : <>{authMode === 'register' ? 'Registrarme y continuar' : authMode === 'login' ? 'Iniciar sesión' : authMode === 'reset' ? 'Enviar enlace' : 'Guardar contraseña'}<ArrowRight size={18} /></>}</button>
                    {authMode === 'reset' && <button type="button" className="text-button" onClick={() => changeAuthMode('login')}><ArrowLeft size={15} /> Volver al inicio de sesión</button>}
                  </form>
                  <p className="privacy-note"><LockKeyhole size={14} /> Tus datos solo serán visibles para ti y el equipo administrador.</p>
                </>}
                {!configured && <button className="preview-link" onClick={() => setStep(2)}>Explorar los horarios previstos <ArrowRight size={16} /></button>}
              </>}

              {step === 2 && <>
                <div className="section-heading"><span className="section-icon"><CalendarDays size={22} /></span><div><h2>Un horario que te quede bien</h2><p>Selecciona una fecha y un espacio disponible en {countryInfo.name}.</p></div></div>
                {loading ? <Loading text="Buscando horarios disponibles…" /> : loadError ? <Message type="error">{loadError}<button className="text-button" onClick={() => void refreshSlots()}><RefreshCw size={15} /> Reintentar</button></Message> : <>
                  <div className="month-heading"><h3>Septiembre <span>2026</span></h3><span><span className="available-dot" /> Disponible</span></div>
                  <div className="date-grid" role="group" aria-label="Fechas disponibles">{days.map(day => { const matches = countrySlots.filter(s => dayKey(s) === day); const first = matches[0]; const count = matches.filter(s => s.available).length; return <button key={day} aria-pressed={activeDay === day} className={`date-card ${activeDay === day ? 'selected' : ''}`} onClick={() => { setSelectedDay(day); setSelectedId(null); setError(''); }} disabled={count === 0}><span>{dateLabel(first.starts_at, country, { weekday: 'short' }).replace('.', '')}</span><strong>{dateLabel(first.starts_at, country, { day: 'numeric' })}</strong><small>{count === 0 ? 'Sin cupos' : `${count} disponibles`}</small></button>; })}</div>
                  <div className="time-heading"><h3>Horarios <span>· 15 minutos</span></h3><p><Globe2 size={14} /> Hora de {countryInfo.zoneLabel}</p></div>
                  <div className="time-grid" role="group" aria-label="Horarios disponibles">{daySlots.map(slot => <button key={slot.id} aria-pressed={selectedId === slot.id} disabled={!slot.available} className={`time-card ${selectedId === slot.id ? 'selected' : ''}`} onClick={() => { setSelectedId(slot.id); setError(''); }}><Clock3 size={17} /><span>{timeLabel(slot.starts_at, country)} <span className="time-dash">–</span> {timeLabel(slot.ends_at, country)}</span>{selectedId === slot.id ? <Check size={16} /> : !slot.available ? <small>No disponible</small> : null}</button>)}</div>
                  {availableCount === 0 && <Message type="notice">Ya no quedan cupos en {countryInfo.name} para esta campaña.</Message>}
                  {reservation && <Message type="notice">Ya tienes una reserva confirmada. Consulta Mi reserva para ver sus detalles.</Message>}
                  {accountError && <Message type="error">{accountError}<button className="text-button" onClick={() => void refreshAccount()}>Reintentar</button></Message>}
                  {error && <Message type="error">{error}</Message>}
                  {selected && <div className="selection-summary"><CheckCircle2 size={20} /><span>{dateLabel(selected.starts_at, country, { weekday: 'long', day: 'numeric', month: 'long' })}<strong>{timeLabel(selected.starts_at, country)} – {timeLabel(selected.ends_at, country)}</strong></span></div>}
                </>}
                <div className="panel-actions"><button className="text-button" onClick={() => { setStep(1); setError(''); }}><ArrowLeft size={16} /> Tus datos</button><button className="primary" onClick={() => setStep(user ? 3 : 1)} disabled={!selected || Boolean(reservation) || accountLoading || Boolean(accountError) || Boolean(loadError)}>{user ? 'Revisar mi reserva' : 'Registrarme para reservar'}<ArrowRight size={17} /></button></div>
                {!configured && <p className="small-note">Puedes explorar las fechas. Esta vista previa no guarda reservas.</p>}
              </>}

              {step === 3 && selected && <>
                <div className="section-heading"><span className="section-icon"><CheckCircle2 size={22} /></span><div><h2>Revisa tu reserva</h2><p>Tu espacio quedará ocupado cuando confirmes.</p></div></div>
                <div className="confirmation-card"><div className="confirmation-label"><Monitor size={20} /><span>Mantenimiento preventivo</span></div><h3>{dateLabel(selected.starts_at, country, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><div className="confirmation-time">{timeLabel(selected.starts_at, country)} <span>– {timeLabel(selected.ends_at, country)}</span></div><p><CountryFlag country={country} /> {countryInfo.name} <span>· Hora de {countryInfo.zoneLabel}</span></p></div>
                <label className="confirm-name">Nombre de quien asiste<input value={fullName} onChange={e => setFullName(e.target.value)} minLength={2} maxLength={120} disabled={busy} /></label><p className="confirm-email">{user?.email}</p>
                {error && <Message type="error">{error}</Message>}
                {accountError && <Message type="error">{accountError}<button className="text-button" onClick={() => void refreshAccount()}>Reintentar</button></Message>}
                <div className="panel-actions"><button className="text-button" disabled={busy} onClick={() => setStep(2)}><ArrowLeft size={16} /> Cambiar horario</button><button className="primary" onClick={book} disabled={busy || fullName.trim().length < 2 || accountLoading || Boolean(accountError) || Boolean(reservation) || Boolean(loadError)}>{busy ? <><LoaderCircle size={17} className="spin" /> Confirmando…</> : <>Confirmar reserva <Check size={18} /></>}</button></div>
                <p className="small-note"><LockKeyhole size={13} /> Una reserva por persona durante esta campaña.</p>
              </>}
            </div>
          </section>
        </div>
        <div className="bottom-note"><ShieldCheck size={18} /><span>Una computadora cuidada, un día de trabajo más tranquilo.</span><span className="bottom-campaign">Mantenimiento preventivo · Septiembre 2026</span></div>
      </>}

      {view === 'mine' && <section className="reservation-view">
        {accountLoading ? <Loading text="Consultando tu reserva…" /> : accountError ? <Message type="error">{accountError}<button className="text-button" onClick={() => void refreshAccount()}>Reintentar</button></Message> : reservation ? <><div className="success-symbol"><Check size={30} /></div><p className="eyebrow">RESERVA CONFIRMADA</p><h2>Nos vemos pronto, {reservation.full_name.split(' ')[0]}.</h2><p className="page-description">Tu espacio ya está reservado. Estos son los detalles de tu cita.</p><div className="ticket"><div className="ticket-top"><Monitor size={23} /><strong>Mantenimiento preventivo</strong><span>15 MIN</span></div><div className="ticket-body"><div><span>FECHA</span><strong>{dateLabel(reservation.starts_at, reservation.country, { weekday: 'long', day: 'numeric', month: 'long' })}</strong></div><div><span>HORARIO</span><strong>{timeLabel(reservation.starts_at, reservation.country)} – {timeLabel(reservation.ends_at, reservation.country)}</strong><small>Hora de {countries[reservation.country].zoneLabel}</small></div><div><span>PAÍS</span><strong><CountryFlag country={reservation.country} /> {countries[reservation.country].name}</strong></div><div><span>ASISTENTE</span><strong>{reservation.full_name}</strong><small>{reservation.email}</small></div></div><div className="ticket-footer"><ShieldCheck size={15} /> Reserva {reservation.id.slice(0, 8).toUpperCase()}</div></div><button className="primary" onClick={() => calendarFile(reservation)}><Download size={18} /> Guardar en mi calendario</button><p className="small-note">Si necesitas cambiar tu cita, contacta al equipo de Soporte TI.</p></> : <><CalendarDays size={40} className="empty-icon" /><h2>Aún no tienes una reserva</h2><p>Elige tu país y encuentra un horario disponible.</p><button className="primary" onClick={() => { setView('booking'); setStep(user ? 2 : 1); }}>Elegir mi horario <ArrowRight size={18} /></button></>}
      </section>}

      {view === 'admin' && isAdmin && <section className="admin-view"><div className="admin-stats">{(['MX', 'CO'] as Country[]).map(code => <div className="admin-stat" key={code}><CountryFlag country={code} /><span>{countries[code].name}<strong>{adminRows.filter(r => r.country === code).length}<small> de 20 reservados</small></strong></span></div>)}</div><div className="table-heading"><h2>Personas registradas</h2><span>{adminRows.length} reservas confirmadas</span></div>{adminError && <Message type="error">{adminError}</Message>}{adminLoading && adminRows.length === 0 ? <Loading text="Consultando la agenda…" /> : adminRows.length === 0 ? <div className="empty-table"><CalendarDays size={32} /><h3>La agenda está lista</h3><p>Las personas aparecerán aquí cuando confirmen su reserva.</p></div> : <div className="table-scroll"><table><thead><tr><th>Persona</th><th>País</th><th>Fecha</th><th>Horario local</th><th>Estado</th></tr></thead><tbody>{adminRows.map(row => <tr key={row.id}><td><strong>{row.full_name}</strong><small>{row.email}</small></td><td><span className="table-country"><CountryFlag country={row.country} />{countries[row.country].name}</span></td><td>{dateLabel(row.starts_at, row.country, { day: 'numeric', month: 'short' })}</td><td>{timeLabel(row.starts_at, row.country)} – {timeLabel(row.ends_at, row.country)}</td><td><span className="confirmed-pill"><Check size={13} /> Confirmada</span></td></tr>)}</tbody></table></div>}</section>}
    </main>
    <footer><span>GEA <span className="footer-separator">/</span> Soporte TI</span><span>México & Colombia</span></footer>
  </div>;
}

function Loading({ text }: { text: string }) { return <div className="loading" role="status"><LoaderCircle size={22} className="spin" />{text}</div>; }
function Message({ type, children }: { type: 'error' | 'notice'; children: React.ReactNode }) { return <div className={`message ${type}`} role={type === 'error' ? 'alert' : 'status'}><Info size={17} /><div>{children}</div></div>; }
