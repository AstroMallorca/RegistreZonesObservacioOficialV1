const STORAGE_KEY = 'zooRecords_v2';
const API_BASE = 'https://square-feather-3951.astromca.workers.dev';
const TZ = 'Europe/Madrid';
const app = document.getElementById('app');
let currentView = 'home';
let currentStep = 'dades';
let editingId = null;
let countdownTimer = null;
let horizonEngine = null;
const emptyRecord = () => ({
  id: crypto.randomUUID(),
  status: 'esborrany',
  version: 1,
  sentVersions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  data: {
    placeName: '',
    municipality: '',
    address: '',
    registrar: '',
    obsDate: '2026-04-29',
    targetTime: '',
    latitude: '',
    longitude: '',
    visibility: '',
    visibleArea: '',
    parking: '',
    access: '',
    notes: ''
  },
  photos: [],
  documents: []
});

function migrateRecords(records) {
  return records.map(r => ({
    ...r,
    data: {
      placeName: '', municipality: '', address: '', registrar: '', obsDate: '2026-04-29', targetTime: '',
      latitude: '', longitude: '', visibility: '', visibleArea: '', parking: '', access: '', notes: '',
      ...(r.data || {})
    },
    photos: Array.isArray(r.photos) ? r.photos : [],
    documents: Array.isArray(r.documents) ? r.documents : (r.document ? [r.document] : []),
    sentVersions: Array.isArray(r.sentVersions) ? r.sentVersions : [],
    version: r.version || 1,
    status: r.status || 'esborrany'
  }));
}

function loadRecords() {
  try {
    const own = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    if (own.length) return migrateRecords(own);
    const old = JSON.parse(localStorage.getItem('zooRecords_v1')) || [];
    return migrateRecords(old);
  } catch {
    return [];
  }
}
function saveRecords(records) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.error('Error guardant a localStorage:', err);
    throw err;
  }
}
function getRecord(id) { return loadRecords().find(r => r.id === id); }
function upsertRecord(record) {
  const records = loadRecords();
  const index = records.findIndex(r => r.id === record.id);
  record.updatedAt = new Date().toISOString();
  if (index >= 0) records[index] = record;
  else records.unshift(record);
  saveRecords(records);
}
function deleteRecord(id) { saveRecords(loadRecords().filter(r => r.id !== id)); }

function render() {
  clearInterval(countdownTimer);
  if (currentView === 'home') renderHome();
  if (currentView === 'drafts') renderList('Editar ZOO', ['esborrany', 'modificat']);
  if (currentView === 'sent') renderList('Enviats', ['enviat']);
  if (currentView === 'new-record') renderEditor(editingId ? getRecord(editingId) : emptyRecord());
}

function template(id) { return document.getElementById(id).content.cloneNode(true); }

function renderHome() {
  app.innerHTML = '';
  const node = template('tpl-home');
  const records = loadRecords();
  const drafts = records.filter(r => r.status === 'esborrany').length;
  const modified = records.filter(r => r.status === 'modificat').length;
  const sent = records.filter(r => r.status === 'enviat').length;
  node.getElementById('home-stats').textContent = `${drafts} esborranys · ${modified} modificats · ${sent} enviats`;
  node.querySelectorAll('.nav').forEach(btn => btn.addEventListener('click', () => {
    currentView = btn.dataset.view;
    editingId = null;
    currentStep = 'dades';
    render();
  }));
  node.getElementById('btn-sync-pending').addEventListener('click', syncPending);
  node.getElementById('btn-help').addEventListener('click', () => {
    alert('Aquesta versió deixa entrar a qualsevol secció en qualsevol moment. L’hora objectiu i el compte enrera es calculen automàticament quan hi ha data i coordenades.');
  });
  app.appendChild(node);
}

function renderList(title, statuses) {
  app.innerHTML = '';
  const node = template('tpl-list');
  node.getElementById('list-title').textContent = title;
  node.querySelector('.back-home').addEventListener('click', () => {
    currentView = 'home';
    render();
  });

  const container = node.getElementById('list-container');
  const list = loadRecords().filter(r => statuses.includes(r.status));

  if (!list.length) {
    container.innerHTML = `<div class="info-banner">No hi ha registres en aquesta secció.</div>`;
  } else {
    list.forEach(record => {
      const div = document.createElement('div');
      div.className = 'record-card';
      const badgeClass = record.status === 'enviat' ? 'good' : record.status === 'modificat' ? 'warn' : 'bad';
      div.innerHTML = `
        <h3>${escapeHtml(record.data.placeName || 'Sense nom')}</h3>
        <div class="tiny">${escapeHtml(record.data.municipality || 'Sense municipi')}</div>
        <div style="margin:10px 0 12px;">
          <span class="badge ${badgeClass}">${record.status}</span>
          <span class="badge">v${record.version}</span>
          <span class="badge">${record.photos.length} fotos</span>
        </div>
        <div class="footer-actions"></div>
      `;
      const actions = div.querySelector('.footer-actions');
      if (record.status === 'enviat') {
        actions.appendChild(actionButton('Nova versió', 'secondary', () => openNewVersion(record.id)));
        actions.appendChild(actionButton('Reenviar', 'ghost', () => submitRecord(record.id, true)));
        actions.appendChild(actionButton('Eliminar còpia local', 'ghost', () => { if (confirm('Eliminar la còpia local?')) { deleteRecord(record.id); render(); } }));
      } else {
        actions.appendChild(actionButton('Obrir', 'secondary', () => {
  editingId = record.id;
  currentView = 'new-record';
  currentStep = 'dades';
  render();
}));
        actions.appendChild(actionButton('Eliminar', 'ghost', () => { if (confirm('Eliminar aquest registre?')) { deleteRecord(record.id); render(); } }));
      }
      container.appendChild(div);
    });
  }
  app.appendChild(node);
}

function actionButton(label, cls, onClick) {
  const btn = document.createElement('button');
  btn.className = cls;
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderEditor(record) {
  if (!record) {
    editingId = null;
    record = emptyRecord();
  }

  app.innerHTML = '';

  const frag = template('tpl-editor');
  app.appendChild(frag);

  const node = app.querySelector('.card.stack-md');
  const refs = bindFormRefs(node);

  node.querySelector('#editor-title').textContent = record.data.placeName || 'Registrar ZOO';
  node.querySelector('#editor-meta').textContent = `${record.status} · v${record.version}`;

  node.querySelector('#editor-back').addEventListener('click', (e) => {
    e.preventDefault();
    currentView = 'home';
    editingId = null;
    render();
  });

  fillForm(refs, record);
  activateChoiceButtons(node, record);
  applyStep(node, currentStep);
  node.querySelectorAll('.step-tab').forEach(btn => {
  btn.classList.toggle('active', btn.dataset.step === currentStep);
});
  renderPhotos(refs.photoList, record);
  renderDocument(refs.documentBox, record);
  renderSummary(refs.summaryBox, record);
  recalcTargetTime(refs, record);
  startCountdown(refs.obsDate, refs.targetTime, refs.countdown, refs.countdownVisibility);

node.querySelectorAll('.step-tab').forEach(btn => {
  btn.onclick = null;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    goToStep(node, refs, record, btn.dataset.step);
  });

  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    goToStep(node, refs, record, btn.dataset.step);
  }, { passive: false });
});

  ['placeName','municipality','address','registrar','latitude','longitude','notes'].forEach(key => {
    refs[key].addEventListener('input', () => {
      saveFormToRecord(refs, record, { silent: true, keepStatus: true });
      if (['latitude','longitude'].includes(key)) {
        recalcTargetTime(refs, record);
      }
      if (key === 'placeName') {
        node.querySelector('#editor-title').textContent = refs.placeName.value.trim() || 'Registrar ZOO';
      }
      renderSummary(refs.summaryBox, record);
    });
  });

  refs.obsDate.addEventListener('change', () => {
    saveFormToRecord(refs, record, { silent: true, keepStatus: true });
    recalcTargetTime(refs, record);
    renderSummary(refs.summaryBox, record);
  });

refs.photoInput.addEventListener('change', async e => {
  const files = [...e.target.files];
  if (!files.length) return;

  try {
    const payloads = await Promise.all(
      files.map(file => fileToCompressedJpegDataUrl(file, 1600, 0.72))
    );

    payloads.forEach((src, i) => {
      record.photos.push({
        id: crypto.randomUUID(),
        name: (files[i].name || `foto-${record.photos.length + i + 1}.jpg`).replace(/\.[^.]+$/, '.jpg'),
        mime: 'image/jpeg',
        src,
        createdAt: new Date().toISOString(),
        latitude: refs.latitude.value.trim(),
        longitude: refs.longitude.value.trim(),
        approxBytes: estimateBase64SizeBytes(src)
      });
    });

    markModified(record);

    try {
      upsertRecord(record);
    } catch (err) {
      console.error('Error guardant fotos:', err);
      alert('La foto és massa gran per guardar-la així. He de reduir encara més la mida o passar les fotos a IndexedDB.');
      record.photos = record.photos.slice(0, Math.max(0, record.photos.length - payloads.length));
      renderPhotos(refs.photoList, record);
      renderSummary(refs.summaryBox, record);
      e.target.value = '';
      return;
    }

    renderPhotos(refs.photoList, record);
    renderSummary(refs.summaryBox, record);
  } catch (err) {
    console.error('Error processant la foto:', err);
    alert('No s’ha pogut processar la foto.');
  }

  e.target.value = '';
});

refs.documentInput.addEventListener('change', async e => {
  const files = [...e.target.files];
  if (!files.length) return;

  try {
    for (const file of files) {
      let src;
      let mime = file.type;
      let name = file.name;

      if (isImageMime(file.type)) {
        src = await fileToCompressedJpegDataUrl(file, 1600, 0.72);
        mime = 'image/jpeg';
        name = (file.name || 'document.jpg').replace(/\.[^.]+$/, '.jpg');
      } else {
        src = await fileToDataUrl(file);
      }

      const doc = {
        id: crypto.randomUUID(),
        name,
        mime,
        src,
        createdAt: new Date().toISOString(),
        approxBytes: estimateBase64SizeBytes(src)
      };

      record.documents.push(doc);
    }

    markModified(record);

    try {
      upsertRecord(record);
    } catch (err) {
      console.error('Error guardant documents:', err);
      alert('Un dels documents és massa gros per guardar-lo així al dispositiu.');
      renderDocument(refs.documentBox, record);
      renderSummary(refs.summaryBox, record);
      e.target.value = '';
      return;
    }

    renderDocument(refs.documentBox, record);
    renderSummary(refs.summaryBox, record);
  } catch (err) {
    console.error('Error processant documents:', err);
    alert('No s’han pogut afegir els documents.');
  }

  e.target.value = '';
});
 
  refs.btnCaptureLocation.addEventListener('click', (e) => {
    e.preventDefault();
    captureLocation(refs, record);
  });

  refs.sendRecord.addEventListener('click', async (e) => {
    e.preventDefault();
    saveFormToRecord(refs, record, { keepStatus: true });
    upsertRecord(record);
    await submitRecord(record.id);
  });

  editingId = record.id;
}

function bindFormRefs(node) {
  return {
    placeName: node.querySelector('#placeName'),
    municipality: node.querySelector('#municipality'),
    address: node.querySelector('#address'),
    registrar: node.querySelector('#registrar'),
    obsDate: node.querySelector('#obsDate'),
    targetTime: node.querySelector('#targetTime'),
    latitude: node.querySelector('#latitude'),
    longitude: node.querySelector('#longitude'),
    notes: node.querySelector('#notes'),
    countdown: node.querySelector('#countdown'),
    countdownVisibility: node.querySelector('#countdown-visibility'),
    photoInput: node.querySelector('#photoInput'),
    photoList: node.querySelector('#photoList'),
    documentInput: node.querySelector('#documentInput'),
    documentBox: node.querySelector('#documentBox'),
    summaryBox: node.querySelector('#summaryBox'),
    btnCaptureLocation: node.querySelector('#btn-capture-location'),
    sendRecord: node.querySelector('#send-record')
  };
}

function fillForm(refs, record) {
  Object.entries(record.data).forEach(([k, v]) => {
    if (refs[k]) refs[k].value = v || '';
  });
}

function saveFormToRecord(refs, record, opts = {}) {
  Object.keys(record.data).forEach(k => {
    if (refs[k]) record.data[k] = refs[k].value.trim();
  });
  if (!opts.keepStatus) markModified(record);
  upsertRecord(record);
}

function markModified(record) {
  if (record.status === 'enviat') record.status = 'modificat';
}

function activateChoiceButtons(node, record) {
  node.querySelectorAll('.choice-group').forEach(group => {
    const field = group.dataset.field;
    group.querySelectorAll('.choice').forEach(btn => {
      if (record.data[field] === btn.dataset.value) btn.classList.add('active');
      btn.addEventListener('click', () => {
        group.querySelectorAll('.choice').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        record.data[field] = btn.dataset.value;
        markModified(record);
        upsertRecord(record);
      });
    });
  });
}

function applyStep(node, step) {
  node.querySelectorAll('.step-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.step === step));
  node.querySelectorAll('.step-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === step));
}
function goToStep(node, refs, record, step) {
  currentStep = step;
  saveFormToRecord(refs, record, { keepStatus: true });
  applyStep(node, currentStep);
  renderSummary(refs.summaryBox, record);

  requestAnimationFrame(() => {
    const activePanel = node.querySelector(`.step-panel[data-panel="${step}"]`);
    if (activePanel) {
      activePanel.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  });
}
function openImageModal(src) {
  const modal = document.getElementById('imageModal');
  const img = document.getElementById('imageModalImg');
  if (!modal || !img) return;

  img.src = src;
  modal.classList.remove('hidden');
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';
}
function closeImageModal(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  const modal = document.getElementById('imageModal');
  const img = document.getElementById('imageModalImg');
  if (!modal || !img) return;

  modal.classList.add('hidden');
  modal.style.display = '';
  img.src = '';
  document.body.style.overflow = '';
}
function initImageModal() {
  const modal = document.getElementById('imageModal');
  const closeBtn = document.getElementById('imageModalClose');
  const backdrop = document.getElementById('imageModalBackdrop');

  if (closeBtn) {
    closeBtn.onclick = closeImageModal;
    closeBtn.ontouchend = closeImageModal;
  }

  if (backdrop) {
    backdrop.onclick = closeImageModal;
    backdrop.ontouchend = closeImageModal;
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeImageModal(e);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeImageModal(e);
  });
}
function renderPhotos(container, record) {
  container.className = 'photo-grid';
  if (!record.photos.length) {
    container.classList.add('empty');
    container.textContent = 'Encara no hi ha fotos.';
    return;
  }
  container.innerHTML = '';
  record.photos.forEach(photo => {
    const div = document.createElement('div');
    div.className = 'photo-card';
    div.innerHTML = `
      <img src="${photo.src}" alt="${escapeHtml(photo.name)}">
      <div class="photo-info">
        <strong>${escapeHtml(photo.name)}</strong>
        <div class="tiny">${formatDateTime(photo.createdAt)}</div>
        <div class="tiny">${photo.latitude || '—'}, ${photo.longitude || '—'}</div>
        <div class="media-actions"></div>
      </div>
    `;
    const actions = div.querySelector('.media-actions');
    actions.appendChild(actionButton('Veure', 'ghost small', () => openImageModal(photo.src)));
    actions.appendChild(actionButton('Eliminar', 'ghost small', () => {
      record.photos = record.photos.filter(p => p.id !== photo.id);
      markModified(record);
      upsertRecord(record);
      renderPhotos(container, record);
    }));
    container.appendChild(div);
  });
}
function renderDocument(container, record) {
  container.className = 'media-list';

  if (!Array.isArray(record.documents) || !record.documents.length) {
    container.classList.add('empty');
    container.textContent = 'No hi ha cap document adjunt.';
    return;
  }

  container.innerHTML = '';

  record.documents.forEach(doc => {
    const div = document.createElement('div');
    div.className = 'record-card';

    let previewHtml = '';
    if (isImageMime(doc.mime)) {
      previewHtml = `
        <div style="margin:0 0 10px;">
          <img
            src="${doc.src}"
            alt="${escapeHtml(doc.name)}"
            style="display:block;width:100%;max-height:220px;object-fit:cover;border-radius:14px;background:#000;"
          >
        </div>
      `;
    }

    div.innerHTML = `
      ${previewHtml}
      <h3>${escapeHtml(doc.name)}</h3>
      <div class="tiny">${escapeHtml(doc.mime || 'document')}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'footer-actions';

    actions.appendChild(actionButton('Veure', 'ghost', () => {
      openDocumentFile(doc);
    }));

    actions.appendChild(actionButton('Eliminar', 'ghost', () => {
      record.documents = record.documents.filter(d => d.id !== doc.id);
      markModified(record);
      upsertRecord(record);
      renderDocument(container, record);
      if (container.closest('.card')) {
        const summaryBox = container.closest('.card').querySelector('#summaryBox');
        if (summaryBox) renderSummary(summaryBox, record);
      }
    }));

    div.appendChild(actions);
    container.appendChild(div);
  });
}

function renderSummary(container, record) {
  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item"><strong>Nom del lloc</strong>${escapeHtml(record.data.placeName || '—')}</div>
      <div class="summary-item"><strong>Municipi</strong>${escapeHtml(record.data.municipality || '—')}</div>
      <div class="summary-item"><strong>Direcció</strong>${escapeHtml(record.data.address || '—')}</div>
      <div class="summary-item"><strong>Persona que registre</strong>${escapeHtml(record.data.registrar || '—')}</div>
      <div class="summary-item"><strong>Data</strong>${escapeHtml(formatShortDate(record.data.obsDate) || '—')}</div>
      <div class="summary-item"><strong>Hora objectiu</strong>${escapeHtml(record.data.targetTime || '—')}</div>
      <div class="summary-item"><strong>Visibilitat</strong>${escapeHtml(record.data.visibility || '—')}</div>
      <div class="summary-item"><strong>Zona visible</strong>${escapeHtml(record.data.visibleArea || '—')}</div>
      <div class="summary-item"><strong>Aparcament</strong>${escapeHtml(record.data.parking || '—')}</div>
      <div class="summary-item"><strong>Accessos</strong>${escapeHtml(record.data.access || '—')}</div>
      <div class="summary-item"><strong>Fotos</strong>${record.photos.length}</div>
      <div class="summary-item"><strong>Documents</strong>${Array.isArray(record.documents) ? record.documents.length : 0}</div>
      <div class="summary-item"><strong>Estat</strong>${record.status}</div>
      <div class="summary-item"><strong>Versió</strong>v${record.version}</div>
    </div>
  `;
}

async function captureLocation(refs, record) {
  if (!navigator.geolocation) {
    alert('Aquest dispositiu no permet geolocalització des del navegador.');
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    refs.latitude.value = pos.coords.latitude.toFixed(6);
    refs.longitude.value = pos.coords.longitude.toFixed(6);
    record.data.latitude = refs.latitude.value;
    record.data.longitude = refs.longitude.value;
    markModified(record);
    upsertRecord(record);
    recalcTargetTime(refs, record);
    renderSummary(refs.summaryBox, record);
  }, err => {
    alert(`No s'ha pogut obtenir la ubicació: ${err.message}`);
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
}

function saveDraft(refs, record) {
  saveFormToRecord(refs, record, { keepStatus: true });
  if (record.status !== 'modificat' && record.status !== 'enviat') record.status = 'esborrany';
  upsertRecord(record);
  alert('Registre guardat al dispositiu.');
}

async function submitRecord(id, forceResend = false) {
  const record = getRecord(id);
  if (!record) return;

  const fileBase = `${slugify(record.data.municipality || 'municipi')}_${slugify(record.data.placeName || 'zoo')}_${record.data.obsDate || '2026-04-29'}_v${record.version}`;
  const payload = { fileBase, record, exportedAt: new Date().toISOString() };

  if (!API_BASE) {
    record.status = 'enviat';
    if (!forceResend) {
      record.sentVersions.push({
        version: record.version,
        sentAt: new Date().toISOString(),
        mode: 'local-demo'
      });
    }
    upsertRecord(record);
    downloadJson(`${fileBase}.json`, payload);
    alert(forceResend
      ? 'S’ha generat de nou el fitxer local de la versió actual.'
      : 'El registre s’ha marcat com enviat i s’ha descarregat un JSON de prova. Quan connectem el servidor, aquí es farà la pujada real.'
    );
    currentView = 'sent';
    render();
    return;
  }

  try {
const response = await fetch(API_BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(payload),
  redirect: 'follow'
});

const rawText = await response.text();
let result = {};

try {
  result = rawText ? JSON.parse(rawText) : {};
} catch {
  result = { raw: rawText };
}

console.log('HTTP status:', response.status);
console.log('Resposta servidor:', result);

if (!response.ok) {
  throw new Error(result.error || result.raw || `HTTP ${response.status}`);
}

alert(JSON.stringify(result, null, 2));
if (result.error) throw new Error(result.error);r);

    record.status = 'enviat';
    if (!forceResend) {
      record.sentVersions.push({
        version: record.version,
        sentAt: new Date().toISOString(),
        mode: 'server'
      });
    }
    upsertRecord(record);
    currentView = 'sent';
    render();
    return result;
  } catch (error) {
    alert(`No s'ha pogut enviar. El registre queda guardat localment.\n\n${error.message}`);
    throw error;
  }
}

function openNewVersion(id) {
  const record = getRecord(id);
  if (!record) return;
  record.version += 1;
  record.status = 'modificat';
  upsertRecord(record);
  editingId = id;
  currentView = 'new-record';
  currentStep = 'dades';
  render();
}

async function syncPending() {
  const pending = loadRecords().filter(r => ['esborrany', 'modificat'].includes(r.status));

  if (!pending.length) {
    alert('No hi ha registres pendents d’enviar.');
    return;
  }

  if (!API_BASE) {
    alert(`Hi ha ${pending.length} registres pendents. La pujada automàtica quedarà activa quan connectem l’API.`);
    return;
  }

  let ok = 0;
  let fail = 0;

  for (const record of pending) {
    try {
      await submitRecord(record.id);
      ok++;
    } catch {
      fail++;
    }
  }

  alert(`Enviaments completats: ${ok}. Errors: ${fail}.`);
  render();
}

function recalcTargetTime(refs, record) {
  const lat = parseFloat(refs.latitude.value);
  const lon = parseFloat(refs.longitude.value);
  const date = refs.obsDate.value;

  const target = Number.isFinite(lat) && Number.isFinite(lon) && date
    ? getSimulationLocalTime(date, lat, lon)
    : '';

  refs.targetTime.value = target || '';
  record.data.targetTime = target || '';
  upsertRecord(record);
  startCountdown(refs.obsDate, refs.targetTime, refs.countdown, refs.countdownVisibility);
}

function startCountdown(dateInput, timeInput, out1, out2) {
  clearInterval(countdownTimer);
  const update = () => {
    const text = getCountdownText(dateInput.value, timeInput.value);
    out1.textContent = text;
    out2.textContent = text;
  };
  update();
  countdownTimer = setInterval(update, 1000);
}

function getCountdownText(dateStr, timeStr) {
  if (!dateStr || !timeStr) return '—';
  const target = new Date(`${dateStr}T${timeStr}`);
  const diff = target.getTime() - Date.now();
  if (Number.isNaN(target.getTime())) return '—';
  if (diff <= 0) return 'Ara pots fer la comprovació';
  const total = Math.floor(diff / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d} dies · ${String(h).padStart(2,'0')} h · ${String(m).padStart(2,'0')} min · ${String(s).padStart(2,'0')} s`;
}

function getSunsetLocalTime(dateStr, lat, lon) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const N = dayOfYear(year, month, day);
  const lngHour = lon / 15;
  const t = N + ((18 - lngHour) / 24);
  const M = (0.9856 * t) - 3.289;
  let L = M + (1.916 * Math.sin(degToRad(M))) + (0.020 * Math.sin(2 * degToRad(M))) + 282.634;
  L = normalizeDegrees(L);
  let RA = radToDeg(Math.atan(0.91764 * Math.tan(degToRad(L))));
  RA = normalizeDegrees(RA);
  const Lquadrant  = Math.floor(L / 90) * 90;
  const RAquadrant = Math.floor(RA / 90) * 90;
  RA = RA + (Lquadrant - RAquadrant);
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(degToRad(L));
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(degToRad(90.833)) - (sinDec * Math.sin(degToRad(lat)))) / (cosDec * Math.cos(degToRad(lat)));
  if (cosH < -1 || cosH > 1) return '';
  let H = radToDeg(Math.acos(cosH));
  H /= 15;
  const T = H + RA - (0.06571 * t) - 6.622;
  let UT = T - lngHour;
  UT = ((UT % 24) + 24) % 24;
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  utcDate.setUTCHours(Math.floor(UT), Math.floor((UT % 1) * 60), Math.round((((UT % 1) * 60) % 1) * 60));
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(utcDate);
}
function getSimulationLocalTime(dateStr, lat, lon) {
  const targetAltitude = getReferenceEclipseMaxAltitude(lat, lon);
  if (!Number.isFinite(targetAltitude)) return '';

  const best = findLocalTimeForSolarAltitude(dateStr, lat, lon, targetAltitude);
  if (!best) return '';

  return formatTimeParts(best.hours, best.minutes, best.seconds);
}

function getReferenceEclipseMaxAltitude(lat, lon) {
  const eclipseDate = new Date('2026-08-12T18:30:00Z');
  return getSolarAltitude(eclipseDate, lat, lon);
}

function findLocalTimeForSolarAltitude(dateStr, lat, lon, targetAltitude) {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;

  let best = null;

  for (let seconds = 0; seconds < 24 * 3600; seconds += 5) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const utcDate = localPartsToUtcDate(year, month, day, h, m, s);
    const altitude = getSolarAltitude(utcDate, lat, lon);

    if (!Number.isFinite(altitude)) continue;

    const diff = Math.abs(altitude - targetAltitude);

    if (!best || diff < best.diff) {
      best = { diff, hours: h, minutes: m, seconds: s, altitude };
    }
  }

  return best;
}

function getSolarAltitude(dateObj, lat, lon) {
  const jd = dateObj.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;

  let L0 = 280.46646 + T * (36000.76983 + T * 0.0003032);
  L0 = normalizeDegrees(L0);

  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  const C =
    Math.sin(degToRad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(degToRad(2 * M)) * (0.019993 - 0.000101 * T) +
    Math.sin(degToRad(3 * M)) * 0.000289;

  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(degToRad(omega));

  const epsilon0 =
    23 +
    (26 + ((21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60)) / 60;

  const epsilon = epsilon0 + 0.00256 * Math.cos(degToRad(omega));

  const decl =
    radToDeg(
      Math.asin(Math.sin(degToRad(epsilon)) * Math.sin(degToRad(lambda)))
    );

  const ra =
    normalizeDegrees(
      radToDeg(
        Math.atan2(
          Math.cos(degToRad(epsilon)) * Math.sin(degToRad(lambda)),
          Math.cos(degToRad(lambda))
        )
      )
    ) / 15;

  const gmst =
    normalizeDegrees(
      280.46061837 +
      360.98564736629 * (jd - 2451545) +
      0.000387933 * T * T -
      (T * T * T) / 38710000
    ) / 15;

  const lst = gmst + lon / 15;
  const hourAngle = normalizeHours(lst - ra) * 15;

  const altitude = radToDeg(
    Math.asin(
      Math.sin(degToRad(lat)) * Math.sin(degToRad(decl)) +
      Math.cos(degToRad(lat)) * Math.cos(degToRad(decl)) * Math.cos(degToRad(hourAngle))
    )
  );

  return applyRefractionToAltitude(altitude);
}

function applyRefractionToAltitude(altitude) {
  if (!Number.isFinite(altitude)) return altitude;
  if (altitude <= -1) return altitude;

  const correction =
    1.02 / Math.tan(degToRad(altitude + 10.3 / (altitude + 5.11))) / 60;

  return altitude + correction;
}

function localPartsToUtcDate(year, month, day, hours, minutes, seconds) {
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = Object.fromEntries(
    dtf.formatToParts(approxUtc).map(p => [p.type, p.value])
  );

  const shownUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  const wantedUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  const diffMs = shownUtc - wantedUtc;

  return new Date(approxUtc.getTime() - diffMs);
}

function formatTimeParts(hours, minutes, seconds) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function normalizeHours(v) {
  let out = v % 24;
  if (out < 0) out += 24;
  if (out > 12) out -= 24;
  return out;
}

function dayOfYear(y, m, d) {
  const start = Date.UTC(y, 0, 0);
  const current = Date.UTC(y, m - 1, d);
  return Math.floor((current - start) / 86400000);
}
function degToRad(v) { return v * Math.PI / 180; }
function radToDeg(v) { return v * 180 / Math.PI; }
function normalizeDegrees(v) { return ((v % 360) + 360) % 360; }

function getSimulationLocalTime(dateStr, lat, lon) {
  const targetAltitude = getReferenceEclipseMaxAltitude(lat, lon);
  if (!Number.isFinite(targetAltitude)) return '';

  const best = findLocalTimeForSolarAltitude(dateStr, lat, lon, targetAltitude);
  if (!best) return '';

  return formatTimeParts(best.hours, best.minutes, best.seconds);
}

function getReferenceEclipseMaxAltitude(lat, lon) {
  // màxim aproximat de l’eclipsi a Mallorca: 12/08/2026 cap a les 20:31:30 hora local
  const refUtc = localPartsToUtcDate(2026, 8, 12, 20, 31, 30);
  return getSolarAltitude(refUtc, lat, lon);
}

function findLocalTimeForSolarAltitude(dateStr, lat, lon, targetAltitude) {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;

  let best = null;

  // cercam només dins la franja útil de capvespre
  const startSeconds = (19 * 3600) + (30 * 60);
  const endSeconds = (21 * 3600) + (0 * 60);

  for (let seconds = startSeconds; seconds <= endSeconds; seconds += 5) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const utcDate = localPartsToUtcDate(year, month, day, h, m, s);
    const altitude = getSolarAltitude(utcDate, lat, lon);

    if (!Number.isFinite(altitude)) continue;

    const diff = Math.abs(altitude - targetAltitude);

    if (!best || diff < best.diff) {
      best = { diff, hours: h, minutes: m, seconds: s };
    }
  }

  return best;
}

function getSolarAltitude(dateObj, lat, lon) {
  const jd = dateObj.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;

  let L0 = 280.46646 + T * (36000.76983 + T * 0.0003032);
  L0 = normalizeDegrees(L0);

  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);

  const C =
    Math.sin(degToRad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(degToRad(2 * M)) * (0.019993 - 0.000101 * T) +
    Math.sin(degToRad(3 * M)) * 0.000289;

  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(degToRad(omega));

  const epsilon0 =
    23 +
    (26 + ((21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60)) / 60;

  const epsilon = epsilon0 + 0.00256 * Math.cos(degToRad(omega));

  const decl = radToDeg(
    Math.asin(Math.sin(degToRad(epsilon)) * Math.sin(degToRad(lambda)))
  );

  const raHours = normalizeDegrees(
    radToDeg(
      Math.atan2(
        Math.cos(degToRad(epsilon)) * Math.sin(degToRad(lambda)),
        Math.cos(degToRad(lambda))
      )
    )
  ) / 15;

  const gmstHours = normalizeDegrees(
    280.46061837 +
    360.98564736629 * (jd - 2451545) +
    0.000387933 * T * T -
    (T * T * T) / 38710000
  ) / 15;

  const lstHours = gmstHours + lon / 15;
  const hourAngleDeg = normalizeHourAngleHours(lstHours - raHours) * 15;

  const altitude = radToDeg(
    Math.asin(
      Math.sin(degToRad(lat)) * Math.sin(degToRad(decl)) +
      Math.cos(degToRad(lat)) * Math.cos(degToRad(decl)) * Math.cos(degToRad(hourAngleDeg))
    )
  );

  return applyRefractionToAltitude(altitude);
}

function applyRefractionToAltitude(altitude) {
  if (!Number.isFinite(altitude)) return altitude;
  if (altitude <= -1) return altitude;

  const correction = 1.02 / Math.tan(degToRad(altitude + 10.3 / (altitude + 5.11))) / 60;
  return altitude + correction;
}

function localPartsToUtcDate(year, month, day, hours, minutes, seconds) {
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = Object.fromEntries(
    dtf.formatToParts(approxUtc).map(p => [p.type, p.value])
  );

  const shownUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  const wantedUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  const diffMs = shownUtc - wantedUtc;

  return new Date(approxUtc.getTime() - diffMs);
}

function formatTimeParts(hours, minutes, seconds) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function normalizeHourAngleHours(v) {
  let out = v % 24;
  if (out < 0) out += 24;
  if (out > 12) out -= 24;
  return out;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function fileToCompressedJpegDataUrl(file, maxSize = 1600, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      img.onerror = reject;
      img.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function estimateBase64SizeBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.ceil(base64.length * 3 / 4);
}
function isImageMime(mime) {
  return String(mime || '').startsWith('image/');
}

function dataUrlToBlobUrl(dataUrl) {
  const parts = dataUrl.split(',');
  const meta = parts[0] || '';
  const base64 = parts[1] || '';
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';

  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

function openDocumentFile(doc) {
  if (!doc || !doc.src) return;

  if (isImageMime(doc.mime)) {
    openImageModal(doc.src);
    return;
  }

  const blobUrl = dataUrlToBlobUrl(doc.src);
  window.open(blobUrl, '_blank');

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60000);
}
function formatDateTime(iso) {
  try { return new Date(iso).toLocaleString('ca-ES'); }
  catch { return iso; }
}
function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const [y,m,d] = dateStr.split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
}
function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'zoo';
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.addEventListener('DOMContentLoaded', () => {
  if (window.HorizonEngine) {
    try {
      horizonEngine = new window.HorizonEngine();
    } catch (err) {
      console.error('No s’ha pogut inicialitzar HorizonEngine:', err);
    }
  }

  initImageModal();
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
});
