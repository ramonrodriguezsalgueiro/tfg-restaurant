async function api(path, opts={}) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || 'Error');
  return data;
}
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const payload = Object.fromEntries(fd.entries());
  try {
    const { user } = await api('/api/login', { method: 'POST', body: JSON.stringify(payload) });
    if (user.role === 'employee' || user.role === 'admin') {
      location.href = '/orderManagement';
    } else {
      location.href = '/book';
    }
  } catch (err) {
    alert(err.message);
  }
});
