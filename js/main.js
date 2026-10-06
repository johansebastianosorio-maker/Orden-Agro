import * as store from './store.js';
import * as dashboard from './views/dashboard.js';
import * as lotes from './views/lotes.js';
import * as inventario from './views/inventario.js';
import * as labores from './views/labores.js';
import * as finanzas from './views/finanzas.js';
import * as personal from './views/personal.js';
import * as archivo from './views/archivo.js';
import * as produccion from './views/produccion.js';
import * as clima from './views/clima.js';
import * as sanidad from './views/sanidad.js';
import { abrirModal, mostrarToast } from './modal.js';
import { escapeHtml } from './format.js';

const VIEWS = {
  dashboard: { title: 'Resumen de finca', subtitle: 'Operación, alertas, lotes, cosecha y resultados registrados.', module: dashboard },
  lotes: { title: 'Mapas y lotes', subtitle: 'Dibuja tus lotes a escala real y asígnales nombre, cultivo y área.', module: lotes },
  labores: { title: 'Labores', subtitle: 'Registra labores por lote con su mano de obra e insumos.', module: labores },
  inventario: { title: 'Bodega', subtitle: 'Insumos y herramientas disponibles en la finca.', module: inventario },
  personal: { title: 'Personal (mano de obra)', subtitle: 'Directorio de trabajadores para asignar en las labores.', module: personal },
  finanzas: { title: 'Gestión Admin', subtitle: 'Ingresos, costos, gastos, impuestos e intereses.', module: finanzas },
  archivo: { title: 'Archivo', subtitle: 'Documentos y soportes de la finca.', module: archivo },
  produccion: { title: 'Producción', subtitle: 'Historial de cosechas y referencias productivas transparentes por lote.', module: produccion },
  clima: { title: 'Clima', subtitle: 'NASA POWER, redes meteorológicas y datos con su fuente identificada.', module: clima },
  sanidad: { title: 'Sanidad del cultivo', subtitle: 'Monitoreo por lote, seguimiento de incidencia y alertas configurables.', module: sanidad },
};

const SECUNDARIAS = ['finanzas', 'personal', 'produccion', 'clima', 'sanidad', 'archivo'];

const onboarding = document.getElementById('auth-screen') || document.getElementById('onboarding');
const shell = document.getElementById('app-shell');
const viewMount = document.getElementById('view-mount');
const viewTitle = document.getElementById('view-title');
const viewSubtitle = document.getElementById('view-subtitle');

function iniciar() {
  const finca = store.getFincaActiva();
  const usuario = store.getUsuarioActivo();

  if (!finca) {
    onboarding.classList.remove('hidden');
    shell.classList.add('hidden');
    return;
  }

  onboarding.classList.add('hidden');
  shell.classList.remove('hidden');
  document.getElementById('brand-finca-nombre').textContent = finca.nombre;
  document.getElementById('brand-usuario-nombre').textContent = usuario ? usuario.nombre : '';
  renderRuta();
}

function renderRuta() {
  const finca = store.getFincaActiva();
  if (!finca) return;
  const key = (window.location.hash || '#dashboard').replace('#', '');
  const vista = VIEWS[key] || VIEWS.dashboard;

  document.querySelectorAll('.nav-item, .tab-item').forEach((a) => a.classList.toggle('active', a.dataset.view === key));
  viewTitle.textContent = vista.title;
  viewSubtitle.textContent = vista.subtitle;
  vista.module.render(viewMount, finca);
}

window.addEventListener('hashchange', renderRuta);

// -------------------------------------------------------------
// Lógica de Autenticación
// -------------------------------------------------------------
const tabLogin = document.getElementById('tab-login');
const tabRegistro = document.getElementById('tab-registro');
const formLogin = document.getElementById('form-login');
const formRegistro = document.getElementById('form-registro');

tabLogin?.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegistro.classList.remove('active');
  formLogin.classList.remove('hidden');
  formRegistro.classList.add('hidden');
});

tabRegistro?.addEventListener('click', () => {
  tabRegistro.classList.add('active');
  tabLogin.classList.remove('active');
  formRegistro.classList.remove('hidden');
  formLogin.classList.add('hidden');
});

formLogin?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Iniciando sesión...';
  
  const fd = new FormData(e.target);
  try {
    await store.login(fd.get('email').trim(), fd.get('password'));
    e.target.reset();
    iniciar();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

formRegistro?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Configurando entorno seguro...';
  
  const fd = new FormData(e.target);
  try {
    await store.registro({
      nombre: fd.get('nombre').trim(),
      finca_nombre: fd.get('finca_nombre').trim(),
      email: fd.get('email').trim(),
      password: fd.get('password')
    });
    e.target.reset();
    iniciar();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Registrarse y configurar entorno';
  }
});

document.getElementById('link-privacidad')?.addEventListener('click', (e) => {
  e.preventDefault();
  abrirModal('Políticas de Privacidad', `
    <div style="font-size: 0.9rem; color: var(--soil-dark);">
      <p>Al aceptar, permites que este software guarde tu información productiva y personal de manera local/cifrada.</p>
      <p style="margin-top:8px;">Cuando el sistema migre a un servidor productivo SaaS, tus datos estarán protegidos bajo esquemas de seguridad Row Level Security, garantizando el secreto empresarial de tus centros de costos y estrategias productivas.</p>
    </div>
  `);
});

document.getElementById('btn-editar-finca').addEventListener('click', () => {
  const finca = store.getFincaActiva();
  const usuario = store.getUsuarioActivo();
  if (!finca || !usuario) return;
  const form = document.createElement('form');
  form.innerHTML = `
    <label>Nombre de la finca
      <input name="finca_nombre" required value="${escapeHtml(finca.nombre)}" />
    </label>
    <label>Tu nombre
      <input name="usuario_nombre" required value="${escapeHtml(usuario.nombre)}" />
    </label>
    <label>Ubicación o referencia (opcional)
      <input name="ubicacion" value="${escapeHtml(finca.ubicacion || '')}" placeholder="Vereda, municipio, departamento" />
    </label>
    <div class="form-actions"><button type="submit" class="btn btn-primary">Guardar cambios</button></div>
  `;
  const cerrar = abrirModal('Editar perfil de finca', form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const datos = new FormData(form);
    try {
      store.actualizarPerfilFinca(finca.id, usuario.id, {
        finca_nombre: datos.get('finca_nombre'),
        usuario_nombre: datos.get('usuario_nombre'),
        ubicacion: datos.get('ubicacion'),
      });
      cerrar();
      iniciar();
      mostrarToast('Perfil actualizado');
    } catch (error) {
      mostrarToast(error.message);
    }
  });
});

document.getElementById('btn-exportar').addEventListener('click', () => {
  const blob = new Blob([store.exportarJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finca-datos-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Reemplazamos el comportamiento de "Borrar todo" por "Cerrar sesión" en la interfaz
const btnReset = document.getElementById('btn-reset');
if (btnReset) {
  btnReset.textContent = 'Cerrar sesión';
  btnReset.classList.remove('btn-danger');
  btnReset.addEventListener('click', () => {
    store.logout();
    window.location.hash = '';
    iniciar();
  });
}

document.getElementById('btn-mas').addEventListener('click', () => {
  const cont = document.createElement('div');
  cont.innerHTML = SECUNDARIAS.map((k) => `<a href="#${k}" class="mas-sheet-item" data-cerrar-mas="${k}">${VIEWS[k].title}</a>`).join('');
  const cerrar = abrirModal('Más', cont);
  cont.querySelectorAll('[data-cerrar-mas]').forEach((a) => a.addEventListener('click', () => cerrar()));
});

iniciar();
