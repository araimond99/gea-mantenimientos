# GEA · Reservas de mantenimiento

App: https://gea-mantenimientos.vercel.app
React + TypeScript + Vite, Vercel y Supabase (proyecto idnkpvmjetslxzhmsryy).
Las migraciones 001 y 002 ya están aplicadas; no volver a ejecutarlas.
Git local aún no tiene remoto de GitHub.

## Acceso
El empleado elige un horario y escribe nombre y correo terminado exactamente en @gea.com, todo en una sola pantalla. Sin contraseña, envío ni confirmación de correo. Se valida el dominio declarado, no la propiedad del correo ni la pertenencia real a GEA.
Supabase crea una sesión anónima; maintenance_enter valida y normaliza el correo en el servidor. Un correo solo puede reservar una vez, incluso desde varias sesiones.
Todos pueden ver el nombre de quien ocupó cada horario; los correos permanecen ocultos. La reserva se consulta y se puede cancelar desde el navegador y sesión donde se creó. Si se cierra sesión o se borran los datos del navegador, contactar a Soporte TI. Entrar con el mismo correo desde otra sesión no revela datos anteriores.

## Agenda
20 cupos por país, cinco por fecha, mantenimiento de 15 minutos.
México: septiembre 21, 22, 28, 29 de 2026 (America/Mexico_City).
Colombia: septiembre 21, 23, 28, 29 (America/Bogota). La semana del 28 será lunes y martes.
Inicios por día: 09:00, 09:30, 10:00, 10:30, 11:00.
Restricciones únicas y bloqueos transaccionales evitan duplicados. Al cancelar, el cupo vuelve a estar disponible. RLS y permisos impiden leer tablas directamente desde la API pública.

## Desarrollo y publicación
Node.js 22.12 o superior. npm install; copiar .env.example a .env.local; npm run dev.
Variables: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY y VITE_REGISTRATION_ENABLED=true. Nunca usar claves secretas en variables VITE.
Verificación: npm test, npm run test:ui y npm run build.
Publicación del proyecto vinculado: vercel deploy --prod --yes.
Para otro proyecto nuevo: aplicar ambas migraciones en orden, habilitar Allow anonymous sign-ins y Allow new users to sign up. Configurar Site URL. No requiere SMTP.

## Administración
El dueño puede consultar maintenance_reservations en el Table Editor de Supabase. La cuenta administradora de la app aún debe designarse.
Crear usuario Email/Password desde Supabase Authentication sin enviar invitación, con contraseña elegida por su dueño. Asignar desde SQL Editor:

```sql
insert into public.maintenance_admins(user_id)
select id from auth.users where lower(email) = lower('CORREO_DEL_ADMINISTRADOR')
on conflict do nothing;
```

Entrar por https://gea-mantenimientos.vercel.app/?admin. Requiere contraseña y rol autorizado; el formulario de empleados no concede administración.

## Pruebas
npm test ejecuta ambas migraciones en PGlite: capacidad, fechas, duración, dominio, privacidad y duplicados.
npm run test:ui comprueba reserva, conflicto, sesión persistente, calendario, rechazo de otros dominios y pantalla móvil con servicios simulados; no crea reservas reales.
