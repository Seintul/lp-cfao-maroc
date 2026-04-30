// Custom French booking widget that POSTs to /api/book
// Config injected by parent page: window.BOOKING_CONFIG = { modele, redirectMerci }

(function() {
  const cfg = window.BOOKING_CONFIG || {};
  const modele       = cfg.modele || 'Test Drive';
  const redirectUrl  = cfg.redirectMerci || '/';

  // Business hours: Mon-Fri 9-18, Sat 10-17, Sun closed
  const HOURS_BY_DAY = {
    0: null,                       // Sunday
    1: { start: 9, end: 18 },      // Monday
    2: { start: 9, end: 18 },
    3: { start: 9, end: 18 },
    4: { start: 9, end: 18 },
    5: { start: 9, end: 18 },
    6: { start: 10, end: 17 },     // Saturday
  };

  const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const DOWS   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  const SHOWROOMS = ['Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Agadir', 'Fès'];

  // Booking widget state
  const state = {
    monthDate: new Date(),
    selectedDate: null,
    selectedHour: null,
  };

  // ── DOM helpers ──────────────────────────────────────
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function isPastDay(d) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return d < today;
  }

  function isAvailableDay(d) {
    const hours = HOURS_BY_DAY[d.getDay()];
    if (!hours) return false;
    if (isPastDay(d)) return false;
    return true;
  }

  function fmtDate(d) {
    return DOWS[d.getDay()].toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) + 'redi'.slice(-3) + ' ' +
           d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDateLong(d) {
    const dows = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    return `${dows[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  // ── Steps ─────────────────────────────────────────────
  const root = document.getElementById('booking-widget');

  function show(stepId) {
    root.querySelectorAll('.bk-step').forEach((s) => s.classList.remove('active'));
    document.getElementById(stepId).classList.add('active');
  }

  // STEP 1 — Date picker
  function renderDatePicker() {
    const step = document.getElementById('step-date');
    step.innerHTML = '';

    const monthDate = state.monthDate;
    const monthLabel = MONTHS[monthDate.getMonth()] + ' ' + monthDate.getFullYear();

    const today = new Date(); today.setHours(0,0,0,0);
    const isCurrentOrPastMonth =
      monthDate.getFullYear() < today.getFullYear() ||
      (monthDate.getFullYear() === today.getFullYear() && monthDate.getMonth() <= today.getMonth());

    step.appendChild(el('div', { class: 'bk-h' }, 'Choisissez une date'));
    step.appendChild(el('div', { class: 'bk-sub' }, 'Lun-Ven : 9h-18h · Samedi : 10h-17h'));

    const nav = el('div', { class: 'bk-month-nav' }, [
      el('button', {
        type: 'button',
        disabled: isCurrentOrPastMonth ? 'true' : null,
        onclick: () => {
          if (isCurrentOrPastMonth) return;
          state.monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
          renderDatePicker();
        },
      }, '‹'),
      el('span', { class: 'bk-month-label' }, monthLabel),
      el('button', {
        type: 'button',
        onclick: () => {
          state.monthDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
          renderDatePicker();
        },
      }, '›'),
    ]);
    step.appendChild(nav);

    const grid = el('div', { class: 'bk-grid' });
    ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].forEach((d) =>
      grid.appendChild(el('div', { class: 'bk-dow' }, d))
    );

    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const lastDay  = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const startWd  = firstDay.getDay();

    for (let i = 0; i < startWd; i++) grid.appendChild(el('div', { class: 'bk-day empty' }));

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
      const available = isAvailableDay(date);
      const cls = available ? 'bk-day available' : 'bk-day disabled';
      grid.appendChild(el('div', {
        class: cls,
        onclick: available ? () => {
          state.selectedDate = date;
          state.selectedHour = null;
          renderTimePicker();
          show('step-time');
        } : null,
      }, String(d)));
    }
    step.appendChild(grid);
  }

  // STEP 2 — Time picker
  function renderTimePicker() {
    const step = document.getElementById('step-time');
    step.innerHTML = '';

    const date = state.selectedDate;
    const hours = HOURS_BY_DAY[date.getDay()];

    step.appendChild(el('button', {
      type: 'button', class: 'bk-back',
      onclick: () => show('step-date'),
    }, '← Changer de date'));

    step.appendChild(el('div', { class: 'bk-h' }, fmtDateLong(date)));
    step.appendChild(el('div', { class: 'bk-sub' }, 'Choisissez un créneau horaire'));

    const slots = el('div', { class: 'bk-slots' });
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();

    for (let h = hours.start; h < hours.end; h++) {
      // Skip past hours if today
      if (isToday && h <= today.getHours()) continue;
      const label = `${pad(h)}h00`;
      slots.appendChild(el('div', {
        class: 'bk-slot',
        onclick: () => {
          state.selectedHour = h;
          renderForm();
          show('step-form');
        },
      }, label));
    }
    step.appendChild(slots);
  }

  // STEP 3 — Form
  function renderForm() {
    const step = document.getElementById('step-form');
    step.innerHTML = '';

    const date = state.selectedDate;
    const hour = state.selectedHour;

    step.appendChild(el('button', {
      type: 'button', class: 'bk-back',
      onclick: () => show('step-time'),
    }, '← Changer de créneau'));

    step.appendChild(el('div', { class: 'bk-h' }, 'Vos coordonnées'));
    step.appendChild(el('div', { class: 'bk-sub' }, 'Notre équipe CRC vous contactera pour confirmer'));

    step.appendChild(el('div', { class: 'bk-summary' }, [
      'RDV : ', el('span', {}, `${fmtDateLong(date)} à ${pad(hour)}h00`),
    ]));

    const errBox = el('div', { class: 'bk-error', style: 'display:none' });
    step.appendChild(errBox);

    const form = el('form', { class: 'bk-form', onsubmit: (e) => handleSubmit(e, errBox) }, [
      field('firstName', 'Prénom *', 'text',  'Votre prénom', true),
      field('lastName',  'Nom *',    'text',  'Votre nom', true),
      field('phone',     'Téléphone *', 'tel', '+212 6 XX XX XX XX', true),
      field('email',     'Email *',  'email', 'exemple@email.com', true),
      selectField('showroom', 'Showroom *', SHOWROOMS, true),
      el('button', { type: 'submit', class: 'bk-submit' }, 'Réservez votre créneau'),
    ]);
    step.appendChild(form);
  }

  function field(name, label, type, placeholder, required) {
    return el('div', { class: 'bk-field' }, [
      el('label', { for: 'bk-'+name }, label),
      el('input', {
        type, id: 'bk-'+name, name,
        placeholder, ...(required ? { required: 'true' } : {}),
      }),
    ]);
  }

  function selectField(name, label, options, required) {
    const sel = el('select', {
      id: 'bk-'+name, name,
      ...(required ? { required: 'true' } : {}),
    });
    sel.appendChild(el('option', { value: '' }, '— Choisir —'));
    options.forEach((o) => sel.appendChild(el('option', { value: o }, o)));
    return el('div', { class: 'bk-field' }, [
      el('label', { for: 'bk-'+name }, label),
      sel,
    ]);
  }

  async function handleSubmit(e, errBox) {
    e.preventDefault();
    errBox.style.display = 'none';

    const btn = e.target.querySelector('.bk-submit');
    btn.disabled = true;
    btn.textContent = 'Envoi en cours...';

    const date = state.selectedDate;
    const hour = state.selectedHour;
    const start = new Date(date);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const data = {
      firstName: e.target.firstName.value.trim(),
      lastName:  e.target.lastName.value.trim(),
      phone:     e.target.phone.value.trim(),
      email:     e.target.email.value.trim(),
      showroom:  e.target.showroom.value,
      modele,
      startISO: start.toISOString(),
      endISO:   end.toISOString(),
    };

    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erreur lors de la réservation');
      window.location.href = redirectUrl;
    } catch (err) {
      errBox.textContent = err.message || 'Une erreur est survenue. Réessayez.';
      errBox.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Réservez votre créneau';
    }
  }

  // ── Init ──────────────────────────────────────────────
  renderDatePicker();
  show('step-date');
})();
