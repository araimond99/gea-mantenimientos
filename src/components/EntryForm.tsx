import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, LoaderCircle, LockKeyhole } from 'lucide-react';
import { configured, friendlyError, registrationOpen, supabase } from '../lib/supabase';

export default function EntryForm({ onEntered, showError }: { onEntered: () => void; showError: (message: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminMode, setAdminMode] = useState(new URLSearchParams(window.location.search).has('admin'));

  async function enter(event: FormEvent) {
    event.preventDefault();
    if (!supabase || busy) return;
    showError('');
    const corporateEmail = email.trim().toLowerCase();
    if (!adminMode && !/^[a-z0-9._%+-]+@gea\.com$/.test(corporateEmail)) {
      showError('Usa un correo que termine exactamente en @gea.com.'); return;
    }
    if (!adminMode && name.trim().length < 2) { showError('Escribe tu nombre completo.'); return; }
    if (!adminMode && !registrationOpen) return;
    setBusy(true);
    try {
      if (adminMode) {
        const result = await supabase.auth.signInWithPassword({ email: corporateEmail, password });
        if (result.error) throw result.error;
        const access = await supabase.rpc('maintenance_is_admin');
        if (access.error || !access.data) { await supabase.auth.signOut(); throw access.error || new Error('NOT_ADMIN'); }
      } else {
        const session = await supabase.auth.signInAnonymously({ options: { data: { full_name: name.trim(), corporate_email: corporateEmail } } });
        if (session.error) throw session.error;
        const result = await supabase.rpc('maintenance_enter', { p_full_name: name.trim(), p_email: corporateEmail });
        if (result.error) { await supabase.auth.signOut(); throw result.error; }
      }
      onEntered();
    } catch (caught) { showError(friendlyError(caught)); }
    finally { setBusy(false); }
  }

  return <>
    <form className="auth-form" onSubmit={enter}>
      {!adminMode && <label>Nombre completo<input autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Escribe tu nombre y apellido" minLength={2} maxLength={120} required disabled={busy} /></label>}
      <label>Correo corporativo<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@gea.com" maxLength={254} required disabled={busy} /></label>
      {adminMode && <label>Contraseña de administración<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /></label>}
      {!adminMode && <p className="entry-note">Acceso para correos @gea.com. Sin contraseña ni confirmación por correo.</p>}
      <button className="primary full-width" type="submit" disabled={!configured || busy || (!adminMode && !registrationOpen)}>{busy ? <><LoaderCircle size={18} className="spin" /> Entrando…</> : <>{adminMode ? 'Entrar a administración' : registrationOpen ? 'Entrar y elegir horario' : 'Registro próximamente'}<ArrowRight size={18} /></>}</button>
    </form>
    <p className="privacy-note"><LockKeyhole size={14} /> Tus datos solo serán visibles para ti y el equipo administrador.</p>
    {adminMode && <button className="preview-link" onClick={() => { setAdminMode(false); showError(''); }}>Volver al acceso para empleados</button>}
  </>;
}
