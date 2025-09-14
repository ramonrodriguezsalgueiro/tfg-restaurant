async function api(path, opts={}) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || 'Error');
  return data;
}
document.getElementById('logout').addEventListener('click', async (e)=>{
  e.preventDefault();
  await api('/api/logout', { method: 'POST' });
  location.href = '/';
});
async function load() {
  const d = document.getElementById('dateFilter').value;
  const qs = d ? `?date=${encodeURIComponent(d)}` : '';
  const { bookings } = await api('/api/bookings' + qs);
  const table = document.getElementById('reservations');
  table.innerHTML = '<tr><th>ID</th><th>Fecha</th><th>Hora</th><th>Comensales</th><th>Cliente</th><th>Estado</th><th>Acciones</th></tr>' +
    bookings.map(b => `
      <tr>
        <td>#${b.id}</td>
        <td>${b.date.substring(0,10)}</td>
        <td>${b.time.substring(0,5)}</td>
        <td>${b.party_size}</td>
        <td>${b.username} <small class="muted">${b.email}</small></td>
        <td>${b.status}</td>
        <td>
          ${['pending','confirmed','seated','completed','cancelled'].map(s => `<button data-id="${b.id}" data-status="${s}">${s}</button>`).join(' ')}
          <button data-id="${b.id}" data-del="1">Eliminar</button>
        </td>
      </tr>
    `).join('');
  table.querySelectorAll('button[data-status]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api(`/api/bookings/${btn.dataset.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status }) });
      load();
    });
  });
  table.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar reserva?')) return;
      await api(`/api/bookings/${btn.dataset.id}`, { method: 'DELETE' });
      load();
    });
  });
}
document.getElementById('refresh').addEventListener('click', load);
load();
