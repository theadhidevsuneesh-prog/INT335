/*
 * store.js — application state, business rules and localStorage persistence.
 * No DOM access here. Every mutation goes through commit(), which saves and
 * notifies subscribers so all three screens re-render from the same state.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'cabinMicroSlot.v1';
  const SLOT_MS = 5 * 60 * 1000;

  // Verified cabin coordinates for the directory.
  const FACULTY = [
    { id: 'f204', name: 'Dr. Sunita Sharma', block: 'Block 34', cabin: '204' },
    { id: 'f210', name: 'Dr. Amit Verma',    block: 'Block 34', cabin: '210' }
  ];

  // Walking time to Block 34 in minutes. BH-4 is from the brief; BH-7 is an estimate.
  const HOSTELS = { 'BH-4': 7, 'BH-7': 10 };

  const STATUSES = ['open', 'busy', 'away'];

  let state = load();
  let persistFailed = false;
  const listeners = new Set();

  /* ---------- persistence ---------- */

  function seed() {
    const now = Date.now();
    const MIN = 60 * 1000;
    const tok = (token, name, reg, topic, hostel, extra) => Object.assign({
      token, name, reg, topic, hostel,
      bookedAt: now - 30 * MIN, status: 'waiting',
      startedAt: null, endedAt: null, extraMs: 0
    }, extra);

    return {
      v: 1,
      activeFaculty: 'f204',     // cabin shown on the door display / faculty console
      selectedFaculty: 'f204',   // faculty chosen in the student directory
      mySlip: null,              // { facultyId, token } for this student's device
      faculties: {
        f204: {
          status: 'open',
          nextToken: 6,
          tokens: [
            tok(1, 'Rohan Mehta', '12301101', 'Big-O of nested loops, Q3 tutorial', 'BH-4',
                { status: 'done', startedAt: now - 28 * MIN, endedAt: now - 23 * MIN }),
            tok(2, 'Ananya Gupta', '12301245', 'CA2 rubric: marks for derivation', 'BH-7',
                { status: 'done', startedAt: now - 23 * MIN, endedAt: now - 17 * MIN, extraMs: SLOT_MS }),
            tok(3, 'Karan Singh', '12302317', 'Step 2 in asymptotic proof', 'BH-4',
                { status: 'serving', startedAt: now - 2 * MIN }),
            tok(4, 'Priya Nair', '12303388', 'Recurrence: master theorem case 2', 'BH-7'),
            tok(5, 'Aman Joshi', '12304456', 'CA2 rubric: partial marks policy', 'BH-4')
          ]
        },
        f210: {
          status: 'busy',
          nextToken: 2,
          tokens: [
            tok(1, 'Sneha Rao', '12305510', 'Normalisation: 3NF vs BCNF', 'BH-4')
          ]
        }
      }
    };
  }

  function isValid(s) {
    return !!s && s.v === 1 && s.faculties && FACULTY.every(f => {
      const x = s.faculties[f.id];
      return x && STATUSES.includes(x.status) && Array.isArray(x.tokens) && Number.isInteger(x.nextToken);
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (isValid(parsed)) return parsed;
      }
    } catch (e) { /* fall through to seed data */ }
    return seed();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      persistFailed = false;
    } catch (e) {
      persistFailed = true;
    }
  }

  function commit() {
    save();
    notify();
  }

  function notify() {
    listeners.forEach(fn => fn(state));
  }

  // Another tab changed the data: reload and re-render without writing back.
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY) {
      state = load();
      notify();
    }
  });

  /* ---------- selectors ---------- */

  const fac = id => state.faculties[id];
  const meta = id => FACULTY.find(f => f.id === id);
  const isActive = t => t.status === 'waiting' || t.status === 'serving';
  const current = id => fac(id).tokens.find(t => t.status === 'serving') || null;
  const waiting = id => fac(id).tokens.filter(t => t.status === 'waiting').sort((a, b) => a.token - b.token);
  const history = id => fac(id).tokens.filter(t => t.status === 'done' || t.status === 'noshow').sort((a, b) => a.token - b.token);
  const find = (id, token) => fac(id).tokens.find(t => t.token === token) || null;
  const slotEndsAt = t => t.startedAt + SLOT_MS + t.extraMs;

  function activeTokenForReg(reg) {
    for (const f of FACULTY) {
      const t = fac(f.id).tokens.find(x => x.reg === reg && isActive(x));
      if (t) return { facultyId: f.id, token: t };
    }
    return null;
  }

  // The token slip on this device (any status, until dismissed).
  function mySlip() {
    const s = state.mySlip;
    if (!s || !fac(s.facultyId)) return null;
    const t = find(s.facultyId, s.token);
    return t ? { facultyId: s.facultyId, token: t } : null;
  }

  // Students in front of a waiting token: the one in the cabin plus lower waiting tokens.
  function aheadOf(facultyId, token) {
    const inCabin = current(facultyId) ? 1 : 0;
    return inCabin + waiting(facultyId).filter(t => t.token < token.token).length;
  }

  /* ---------- actions (each returns { ok, error?, field? }) ---------- */

  const ok = () => ({ ok: true });
  const fail = (error, field) => ({ ok: false, error, field });

  function book(facultyId, input) {
    const f = fac(facultyId);
    if (!f) return fail('Please choose a faculty member.');
    const name = String(input.name || '').trim();
    const reg = String(input.reg || '').trim();
    const topic = String(input.topic || '').trim().slice(0, 140);
    const hostel = HOSTELS[input.hostel] ? input.hostel : 'BH-4';

    if (name.length < 2) return fail('Enter your full name.', 'name');
    if (!/^\d{8}$/.test(reg)) return fail('Registration number must be exactly 8 digits.', 'reg');
    if (!topic) return fail('Describe your doubt, e.g. "Step 2 in asymptotic proof".', 'topic');
    if (f.status !== 'open') return fail(meta(facultyId).name + ' is not taking bookings right now.');

    const dup = activeTokenForReg(reg);
    if (dup) return fail('Registration ' + reg + ' already has active token ' + fmtToken(dup.token.token) +
      ' with ' + meta(dup.facultyId).name + '. Cancel it before booking again.', 'reg');

    const token = { token: f.nextToken++, name, reg, topic, hostel, bookedAt: Date.now(),
                    status: 'waiting', startedAt: null, endedAt: null, extraMs: 0 };
    f.tokens.push(token);
    state.mySlip = { facultyId, token: token.token };
    commit();
    return ok();
  }

  function cancel(facultyId, tokenNo) {
    const t = find(facultyId, tokenNo);
    if (!t || !isActive(t)) return fail('This token is no longer active.');
    t.status = 'cancelled';
    t.endedAt = Date.now();
    commit();
    return ok();
  }

  // Promote the lowest waiting token into the cabin.
  function promote(facultyId) {
    const next = waiting(facultyId)[0];
    if (next) { next.status = 'serving'; next.startedAt = Date.now(); next.extraMs = 0; }
  }

  function finish(t, status) {
    t.status = status;
    t.endedAt = Date.now();
  }

  function callNext(facultyId) {
    const f = fac(facultyId);
    if (f.status !== 'open') return fail('Set your status to Open before calling students.');
    if (!waiting(facultyId).length) return fail('No students are waiting.');
    const cur = current(facultyId);
    if (cur) finish(cur, 'done');
    promote(facultyId);
    commit();
    return ok();
  }

  function completeVisit(facultyId) {
    const cur = current(facultyId);
    if (!cur) return fail('No student is in the cabin.');
    finish(cur, 'done');
    commit();
    return ok();
  }

  // Skip a student who did not arrive and move on without stalling the queue.
  function noShow(facultyId) {
    const cur = current(facultyId);
    if (!cur) return fail('No student has been called.');
    finish(cur, 'noshow');
    if (fac(facultyId).status === 'open') promote(facultyId);
    commit();
    return ok();
  }

  function extend(facultyId) {
    const cur = current(facultyId);
    if (!cur) return fail('No student is in the cabin.');
    cur.extraMs += SLOT_MS;
    commit();
    return ok();
  }

  function setStatus(facultyId, status) {
    if (!STATUSES.includes(status) || !fac(facultyId)) return fail('Unknown status.');
    fac(facultyId).status = status;
    commit();
    return ok();
  }

  function setActiveFaculty(id) { if (fac(id)) { state.activeFaculty = id; commit(); } }
  function setSelectedFaculty(id) { if (fac(id)) { state.selectedFaculty = id; commit(); } }
  function dismissSlip() { state.mySlip = null; commit(); }
  function reset() { state = seed(); commit(); }

  /* ---------- CSV export ---------- */

  function fmtToken(n) { return '#' + String(n).padStart(2, '0'); }

  function fmtDuration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function csvCell(value) {
    let s = String(value == null ? '' : value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv(facultyId) {
    const m = meta(facultyId);
    const rows = [['Token', 'Reg No', 'Name', 'Doubt Topic', 'Time In', 'Duration (mm:ss)', 'Outcome']];
    history(facultyId).forEach(t => {
      const d = new Date(t.startedAt);
      const pad = n => String(n).padStart(2, '0');
      const when = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
                   pad(d.getHours()) + ':' + pad(d.getMinutes());
      rows.push([fmtToken(t.token), t.reg, t.name, t.topic, when,
                 fmtDuration(t.endedAt - t.startedAt), t.status === 'noshow' ? 'No-show' : 'Resolved']);
    });
    return {
      filename: 'visit-log-cabin' + m.cabin + '-' + new Date().toISOString().slice(0, 10) + '.csv',
      text: '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')
    };
  }

  global.CMS = global.CMS || {};
  global.CMS.store = {
    FACULTY, HOSTELS, SLOT_MS,
    get state() { return state; },
    get persistFailed() { return persistFailed; },
    subscribe: fn => listeners.add(fn),
    meta, current, waiting, history, slotEndsAt, activeTokenForReg, mySlip, aheadOf,
    book, cancel, callNext, completeVisit, noShow, extend, setStatus,
    setActiveFaculty, setSelectedFaculty, dismissSlip, reset, exportCsv,
    fmtToken, fmtDuration
  };
})(window);
