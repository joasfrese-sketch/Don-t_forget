// Modaler Dialog; beim Schließen wird die Route auf die Hauptansicht zurückgesetzt.
export function openDialog(html) {
  document.querySelector('dialog[open]')?.close();
  const dlg = document.createElement('dialog');
  dlg.className = 'w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-card p-5 text-ink shadow-xl backdrop:bg-[#0f1b2d]/50';
  dlg.innerHTML = html;
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (location.hash !== '#/' && location.hash !== '') history.replaceState(null, '', '#/');
  });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}
