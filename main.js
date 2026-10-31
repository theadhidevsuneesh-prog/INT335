/*
 * main.js — wiring: view switching, one delegated click handler, form handling.
 * Using delegation means re-rendering never detaches a handler or swallows a click.
 */
(function () {
  'use strict';

  const S = CMS.store;
  const R = CMS.render;
  const $ = id => document.getElementById(id);
  const wide = window.matchMedia('(min-width: 760px)');

  /* ---------- view switching (tabs / #hash; ?#door suits a mounted display) ---------- */

  function applyView() {
    let v = location.hash.slice(1);
    if (!['student', 'door', 'faculty', 'all'].includes(v)) v = wide.matches ? 'all' : 'student';
    if (v === 'all' && !wide.matches) v = 'student';
    document.body.dataset.view = v;
    document.querySelectorAll('[data-action="view"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
  }

  /* ---------- inline alerts ---------- */

  function showFacultyAlert(msg) {
    const el = $('fac-alert');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  function showBookError(msg, field) {
    const el = $('book-error');
    el.textContent = msg || '';
    el.hidden = !msg;
    if (field) $({ name: 'stu-name', reg: 'stu-reg', topic: 'stu-topic' }[field] || 'stu-name').focus();
  }

  function downloadCsv() {
    const { filename, text } = S.exportCsv(S.state.activeFaculty);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- click actions ---------- */

  const actions = {
    view: b => { location.hash = b.dataset.view; },
    status: b => S.setStatus(S.state.activeFaculty, b.dataset.status),
    'call-next': () => S.callNext(S.state.activeFaculty),
    'no-show': () => S.noShow(S.state.activeFaculty),
    extend: () => S.extend(S.state.activeFaculty),
    complete: () => S.completeVisit(S.state.activeFaculty),
    cancel: b => S.cancel(b.dataset.faculty, Number(b.dataset.token)),
    'dismiss-slip': () => S.dismissSlip(),
    export: () => downloadCsv(),
    fullscreen: () => { const p = $('pane-door'); if (p.requestFullscreen) p.requestFullscreen(); },
    reset: () => { if (confirm('Reset all queues and history to the demo data?')) S.reset(); }
  };

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const run = actions[btn.dataset.action];
    if (!run) return;
    const res = run(btn);
    if (btn.closest('#pane-faculty')) showFacultyAlert(res && res.ok === false ? res.error : '');
  });

  /* ---------- student form ---------- */

  $('book-form').addEventListener('submit', e => {
    e.preventDefault();
    const res = S.book(S.state.selectedFaculty, {
      name: $('stu-name').value,
      reg: $('stu-reg').value,
      topic: $('stu-topic').value,
      hostel: $('stu-hostel').value
    });
    showBookError(res.ok ? '' : res.error, res.field);
    if (res.ok) $('stu-topic').value = '';
  });

  $('book-form').addEventListener('input', () => {
    showBookError('');
    $('stu-reg').value = $('stu-reg').value.replace(/\D/g, '');
    R.updateBookingState();
  });

  $('faculty-select').addEventListener('change', e => { showBookError(''); S.setSelectedFaculty(e.target.value); });
  $('fac-select').addEventListener('change', e => { showFacultyAlert(''); S.setActiveFaculty(e.target.value); });

  /* ---------- start ---------- */

  R.init();
  applyView();
  window.addEventListener('hashchange', applyView);
  wide.addEventListener('change', applyView);
  S.subscribe(R.renderAll);
  R.renderAll();
  setInterval(R.renderTimers, 1000);
})();
