/*
 * render.js — pure view code. Reads state from the store and updates the DOM.
 * Form inputs are never rebuilt, so typing is not lost when state changes.
 */
(function (global) {
  'use strict';

  const S = global.CMS.store;
  const $ = id => document.getElementById(id);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tok = S.fmtToken;

  const STATUS_UI = {
    open: { cls: 'ok',   short: 'Open for doubts', door: 'OPEN FOR 1-ON-1 DOUBTS (5-MIN SLOTS)' },
    busy: { cls: 'warn', short: 'Busy',            door: 'BUSY: EVALUATING ASSIGNMENTS / DEEP WORK' },
    away: { cls: 'bad',  short: 'Away',            door: 'OUT OF CABIN: IN LECTURE / ON DUTY' }
  };

  const clock = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const where = m => m.block + ', Cabin ' + m.cabin;

  /* ---------- one-time setup ---------- */

  function init() {
    const opts = S.FACULTY.map(f => `<option value="${f.id}">${esc(f.name)} — ${esc(where(f))}</option>`).join('');
    $('faculty-select').innerHTML = opts;
    $('fac-select').innerHTML = opts;
    $('stu-hostel').innerHTML = Object.keys(S.HOSTELS)
      .map(h => `<option value="${h}">${h} (about ${S.HOSTELS[h]} min walk)</option>`).join('');
  }

  /* ---------- student portal ---------- */

  function renderStudent() {
    const st = S.state;
    const fid = st.selectedFaculty;
    const m = S.meta(fid);
    const status = st.faculties[fid].status;
    $('faculty-select').value = fid;

    $('directory').innerHTML =
      `<div class="dir-row"><div><strong>${esc(m.name)}</strong><div class="muted">${esc(where(m))}</div></div>` +
      `<span class="pill pill-${STATUS_UI[status].cls}">${STATUS_UI[status].short}</span></div>` +
      `<div class="muted">${S.waiting(fid).length} waiting in line</div>`;

    updateBookingState();
    renderSlip();
  }

  // Enable/disable the booking button and explain why (status closed or duplicate reg).
  function updateBookingState() {
    const fid = S.state.selectedFaculty;
    const m = S.meta(fid);
    const status = S.state.faculties[fid].status;
    const reg = $('stu-reg').value.trim();
    let reason = '';

    if (status !== 'open') {
      reason = m.name + (status === 'busy' ? ' is busy with deep work' : ' is away from the cabin') +
               '. Booking reopens when the status is set back to Open.';
    } else if (/^\d{8}$/.test(reg)) {
      const dup = S.activeTokenForReg(reg);
      if (dup) reason = 'Registration ' + reg + ' already has active token ' + tok(dup.token.token) +
                        ' with ' + S.meta(dup.facultyId).name + '. Only one active token per student.';
    }
    $('book-btn').disabled = !!reason;
    $('book-hint').hidden = !reason;
    $('book-hint').textContent = reason;
  }

  function renderSlip() {
    const slip = S.mySlip();
    const box = $('slip');
    if (!slip) { box.innerHTML = ''; return; }

    const t = slip.token;
    const m = S.meta(slip.facultyId);
    const header = `<div class="slip-head"><span class="slip-label">Your token</span>` +
                   `<span class="slip-token">${tok(t.token)}</span></div>` +
                   `<div class="muted">${esc(m.name)} — ${esc(where(m))}</div>` +
                   `<div class="slip-topic">${esc(t.name)} · ${esc(t.reg)}<br>${esc(t.topic)}</div>`;
    let body = '';

    if (t.status === 'waiting') {
      const ahead = S.aheadOf(slip.facultyId, t);
      const walk = S.HOSTELS[t.hostel];
      const paused = S.state.faculties[slip.facultyId].status !== 'open';
      let alert;
      if (ahead > 1) {
        alert = `<div class="alert alert-warn"><strong>Stay in hostel until 1 student is ahead.</strong> Walk from ${esc(t.hostel)} takes ~${walk} minutes.</div>`;
      } else if (ahead === 1) {
        alert = `<div class="alert alert-ok"><strong>Time to leave!</strong> 1 student is ahead. Walk from ${esc(t.hostel)} takes ~${walk} minutes.</div>`;
      } else {
        alert = `<div class="alert alert-ok"><strong>You are next.</strong> Head to ${esc(where(m))} now (~${walk} minutes from ${esc(t.hostel)}).</div>`;
      }
      if (paused) alert += `<div class="alert alert-warn">The queue is paused: ${esc(m.name)} is currently ${S.state.faculties[slip.facultyId].status === 'busy' ? 'busy' : 'away'}.</div>`;
      body = `<div class="ahead"><span class="ahead-n">${ahead}</span> ${ahead === 1 ? 'student' : 'students'} ahead of you</div>` + alert +
             `<button type="button" class="btn btn-danger btn-block" data-action="cancel" data-faculty="${slip.facultyId}" data-token="${t.token}">Cancel Token</button>`;
    } else if (t.status === 'serving') {
      body = `<div class="turn">YOUR TURN!<br><span>Enter Cabin ${esc(m.cabin)} now</span></div>`;
    } else {
      const msg = {
        done: 'Visit completed. Hope your doubt is cleared.',
        noshow: 'You were marked as a no-show. You can book a new slot.',
        cancelled: 'Token cancelled. You have been removed from the queue.'
      }[t.status];
      body = `<div class="alert alert-info">${msg}</div>` +
             `<button type="button" class="btn btn-block" data-action="dismiss-slip">Dismiss</button>`;
    }
    box.innerHTML = `<div class="card slip slip-${t.status}">${header}${body}</div>`;
  }

  /* ---------- door display ---------- */

  function renderDoor() {
    const fid = S.state.activeFaculty;
    const m = S.meta(fid);
    const status = S.state.faculties[fid].status;
    const cur = S.current(fid);
    const wait = S.waiting(fid);

    $('h-door').textContent = 'Cabin ' + m.cabin + ', ' + m.block;
    $('door-faculty').textContent = m.name;

    const pill = $('door-pill');
    pill.className = 'door-pill door-pill-' + STATUS_UI[status].cls;
    pill.textContent = STATUS_UI[status].door;
    $('door-lock').hidden = status !== 'busy';

    $('door-token').textContent = cur ? tok(cur.token) : '--';
    $('door-topic').textContent = cur ? cur.topic : (status === 'open' ? 'Cabin is free' : 'No consultations right now');
    $('door-reg').textContent = cur ? 'Reg. No. ' + cur.reg : '';
    $('door-waiting').textContent = wait.length;
    $('door-next').textContent = wait.length ? 'Next up: ' + tok(wait[0].token) : '';
    renderTimers();
  }

  // Called every second; only touches timer text.
  function renderTimers() {
    const cur = S.current(S.state.activeFaculty);
    ['door-timer', 'fac-timer'].forEach(id => {
      const el = $(id);
      if (!el) return;
      if (!cur) { el.textContent = ''; el.classList.remove('over'); return; }
      const left = S.slotEndsAt(cur) - Date.now();
      el.classList.toggle('over', left < 0);
      el.textContent = left >= 0 ? 'Slot time left ' + S.fmtDuration(left)
                                 : 'Slot over by ' + S.fmtDuration(-left);
    });
  }

  /* ---------- faculty console ---------- */

  function renderFaculty() {
    const fid = S.state.activeFaculty;
    const f = S.state.faculties[fid];
    const cur = S.current(fid);
    const wait = S.waiting(fid);
    const hist = S.history(fid);
    $('fac-select').value = fid;

    document.querySelectorAll('[data-action="status"]').forEach(b => {
      const on = b.dataset.status === f.status;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on);
    });

    $('fac-current').innerHTML = cur
      ? `<div class="cur-token">${tok(cur.token)}</div><div><strong>${esc(cur.name)}</strong> · ${esc(cur.reg)}` +
        `<div class="muted">${esc(cur.topic)}</div><div>Entered ${clock(cur.startedAt)} · <span id="fac-timer" class="timer"></span></div></div>`
      : '<div class="muted">Nobody in the cabin.</div>';

    // Disable each control when its action is not valid, and say why.
    const canCall = f.status === 'open' && wait.length > 0;
    $('btn-next').disabled = !canCall;
    $('btn-noshow').disabled = !cur;
    $('btn-extend').disabled = !cur;
    $('btn-complete').disabled = !cur;
    $('btn-export').disabled = hist.length === 0;
    $('fac-hint').textContent = f.status !== 'open' ? 'Set status to Open to call the next student.'
      : !wait.length ? 'No students are waiting.' : '';

    $('fac-waiting-count').textContent = wait.length;
    $('fac-waiting').innerHTML = wait.length
      ? wait.map(t => `<li><strong>${tok(t.token)}</strong> ${esc(t.name)} <span class="muted">${esc(t.reg)} · ${esc(t.topic)}</span></li>`).join('')
      : '<li class="muted">Queue is empty.</li>';

    $('history-body').innerHTML = hist.length
      ? hist.slice().reverse().map(t => `<tr><td>${tok(t.token)}</td><td>${esc(t.reg)}</td><td>${esc(t.name)}</td>` +
          `<td>${esc(t.topic)}</td><td>${clock(t.startedAt)}</td><td>${S.fmtDuration(t.endedAt - t.startedAt)}</td>` +
          `<td>${t.status === 'noshow' ? '<span class="tag tag-bad">No-show</span>' : '<span class="tag tag-ok">Resolved</span>'}</td></tr>`).join('')
      : '<tr><td colspan="7" class="muted">No visits recorded yet.</td></tr>';
    renderTimers();
  }

  function renderAll() {
    renderStudent();
    renderDoor();
    renderFaculty();
    $('storage-warning').hidden = !S.persistFailed;
  }

  global.CMS.render = { init, renderAll, renderTimers, updateBookingState };
})(window);
