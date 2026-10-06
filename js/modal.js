// Modal genérico reutilizado por las vistas de lotes, labores,
// inventario y finanzas para sus formularios de creación/edición.

export function abrirModal(titulo, contenidoNode) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const h2 = document.createElement('h2');
  h2.textContent = titulo;
  modal.appendChild(h2);
  modal.appendChild(contenidoNode);
  backdrop.appendChild(modal);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) cerrar();
  });
  const onKey = (e) => {
    if (e.key === 'Escape') cerrar();
  };
  document.addEventListener('keydown', onKey);

  function cerrar() {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
  }

  document.body.appendChild(backdrop);
  const primerInput = modal.querySelector('input, select, textarea');
  if (primerInput) primerInput.focus();

  return cerrar;
}

export function mostrarToast(mensaje) {
  const toast = document.getElementById('toast');
  toast.textContent = mensaje;
  toast.classList.remove('hidden');
  clearTimeout(mostrarToast._t);
  mostrarToast._t = setTimeout(() => toast.classList.add('hidden'), 2600);
}
