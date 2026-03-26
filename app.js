const STORAGE_KEY = 'zooRecords_v1';
const API_BASE = ''; // Ex.: 'https://astromallorca.com/api'

const app = document.getElementById('app');
let currentView = 'home';
let currentStep = 'dades';
let editingId = null;
let countdownTimer = null;

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
    region: 'Illes Balears',
    address: '',
    postalCode: '',
    registrar: '',
    obsDate: todayLocal(),
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
  document: null
});

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}
function getRecord(id) {
  return loadRecords().find(r => r.id === id);
}
function upsertRecord(record) {
  const records = loadRecords();
  const index = records.findIndex(r => r.id === record.id);
  record.updatedAt = new Date().toISOString();
  if (index >= 0) records[index] = record;
  else records.unshift(record);
  saveRecords(records);
}
function deleteRecord(id) {
  saveRecords(loadRecords().filter(r => r.id !== id));
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function render() {
  clearInterval(countdownTimer);
  if (currentView === 'home') renderHome();
  if (currentView === 'drafts') renderList('Editar ZOO', ['esborrany', 'modificat']);
  if (currentView === 'sent') renderList('Enviats', ['enviat']);
  if (currentView === 'new-record') renderEditor(editingId ? getRecord(editingId) : emptyRecord());
}

function template(id) {
  return document.getElementById(id).content.cloneNode(true);
}

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
    render();
  }));
  node.getElementById('btn-sync-pending').addEventListener('click', syncPending);
  node.getElementById('btn-help').addEventListener('click', () => {
    alert('Aquesta primera versió ja permet crear, editar, guardar i preparar l’enviament de registres. L’API d’enviament queda preparada per connectar-se a un servidor.');
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
        actions.appendChild(actionButton('Obrir', 'secondary', () => { editingId = record.id; currentView = 'new-record'; render(); }));
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
    currentView = 'new-record';
    record = emptyRecord();
  }

  app.innerHTML = '';
  const node = template('tpl-editor');
  node.getElementById('editor-title').textContent = record.data.placeName ? record.data.placeName : 'Registrar ZOO';
  node.getElementById('editor-meta').textContent = `${record.status} · v${record.version}`;
  node.getElementById('editor-back').addEventListener('click', () => {
    currentView = 'home';
    editingId = null;
    render();
  });

  const refs = bindFormRefs(node);
  fillForm(refs, record);
  applyStep(node, currentStep);
  renderPhotos(refs.photoList, record);
  renderDocument(refs.documentBox, record);
  renderSummary(refs.summaryBox, record);
  activateChoiceButtons(node, record);
  startCountdown(refs.targetTime, refs.obsDate, node.getElementById('countdown'));

  node.querySelectorAll('.step-tab').forEach(btn => btn.addEventListener('click', () => {
    currentStep = btn.dataset.step;
    saveFormToRecord(refs, record);
    applyStep(node, currentStep);
    renderSummary(refs.summaryBox, record);
  }));
  node.querySelectorAll('.go-step').forEach(btn => btn.addEventListener('click', () => {
    currentStep = btn.dataset.step;
    saveFormToRecord(refs, record);
    applyStep(node, currentStep);
    renderSummary(refs.summaryBox, record);
  }));

  refs.photoInput.addEventListener('change', async e => {
    const files = [...e.target.files];
    const payloads = await Promise.all(files.map(fileToDataUrl));
    payloads.forEach((src, i) => record.photos.push({
      id: crypto.randomUUID(),
      name: files[i].name || `foto-${i+1}.jpg`,
      mime: files[i].type,
      src,
      createdAt: new Date().toISOString(),
      latitude: refs.latitude.value,
      longitude: refs.longitude.value
    }));
    markModified(record);
    upsertRecord(record);
    renderPhotos(refs.photoList, record);
    renderSummary(refs.summaryBox, record);
    e.target.value = '';
  });

  refs.documentInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    record.document = {
      id: crypto.randomUUID(),
      name: file.name,
      mime: file.type,
      src: await fileToDataUrl(file),
      createdAt: new Date().toISOString()
    };
    markModified(record);
    upsertRecord(record);
    renderDocument(refs.documentBox, record);
    renderSummary(refs.summaryBox, record);
    e.target.value = '';
  });

  refs.btnCaptureLocation.addEventListener('click', () => captureLocation(refs, record));
  refs.saveDraftTop.addEventListener('click', () => saveDraft(refs, record));
  refs.saveDraftPhotos.addEventListener('click', () => saveDraft(refs, record));
  refs.saveDraftDoc.addEventListener('click', () => saveDraft(refs, record));
  refs.saveDraftFinal.addEventListener('click', () => saveDraft(refs, record));
  refs.sendRecord.addEventListener('click', async () => {
    saveFormToRecord(refs, record);
    upsertRecord(record);
    await submitRecord(record.id);
  });

  app.appendChild(node);
  editingId = record.id;
}

function bindFormRefs(node) {
  return {
    placeName: node.getElementById('placeName'), municipality: node.getElementById('municipality'), region: node.getElementById('region'),
    address: node.getElementById('address'), postalCode: node.getElementById('postalCode'), registrar: node.getElementById('registrar'),
    obsDate: node.getElementById('obsDate'), targetTime: node.getElementById('targetTime'), latitude: node.getElementById('latitude'),
    longitude: node.getElementById('longitude'), notes: node.getElementById('notes'), photoInput: node.getElementById('photoInput'),
    photoList: node.getElementById('photoList'), documentInput: node.getElementById('documentInput'), documentBox: node.getElementById('documentBox'),
    summaryBox: node.getElementById('summaryBox'), btnCaptureLocation: node.getElementById('btn-capture-location'),
    saveDraftTop: node.getElementById('save-draft-top'), saveDraftPhotos: node.getElementById('save-draft-photos'),
    saveDraftDoc: node.getElementById('save-draft-doc'), saveDraftFinal: node.getElementById('save-draft-final'), sendRecord: node.getElementById('send-record')
  };
}

function fillForm(refs, record) {
  Object.entries(record.data).forEach(([k,v]) => { if (refs[k]) refs[k].value = v || ''; });
}

function saveFormToRecord(refs, record) {
  Object.keys(record.data).forEach(k => { if (refs[k]) record.data[k] = refs[k].value.trim(); });
  markModified(record);
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

function renderPhotos(container, record) {
  container.className = 'media-list';
  if (!record.photos.length) {
    container.classList.add('empty');
    container.textContent = 'Encara no hi ha fotos.';
    return;
  }
  container.innerHTML = '';
  record.photos.forEach(photo => {
    const div = document.createElement('div');
    div.className = 'media-item';
    div.innerHTML = `
      <img src="${photo.src}" alt="${escapeHtml(photo.name)}">
      <div>
        <strong>${escapeHtml(photo.name)}</strong>
        <div class="tiny">${formatDateTime(photo.createdAt)}</div>
        <div class="tiny">${photo.latitude || '—'}, ${photo.longitude || '—'}</div>
        <div class="media-actions"></div>
      </div>
    `;
    const actions = div.querySelector('.media-actions');
    actions.appendChild(actionButton('Veure', 'ghost small', () => window.open(photo.src, '_blank')));
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
  if (!record.document) {
    container.classList.add('empty');
    container.textContent = 'No hi ha cap document adjunt.';
    return;
  }
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'record-card';
  div.innerHTML = `<h3>${escapeHtml(record.document.name)}</h3><div class="tiny">${record.document.mime || 'document'}</div>`;
  const actions = document.createElement('div');
  actions.className = 'footer-actions';
  actions.appendChild(actionButton('Veure', 'ghost', () => window.open(record.document.src, '_blank')));
  actions.appendChild(actionButton('Eliminar', 'ghost', () => {
    record.document = null;
    markModified(record);
    upsertRecord(record);
    renderDocument(container, record);
  }));
  div.appendChild(actions);
  container.appendChild(div);
}

function renderSummary(container, record) {
  container.innerHTML = `
    <div class="summary-grid">
      <div class="summary-item"><strong>Nom del lloc</strong>${escapeHtml(record.data.placeName || '—')}</div>
      <div class="summary-item"><strong>Municipi</strong>${escapeHtml(record.data.municipality || '—')}</div>
      <div class="summary-item"><strong>Visibilitat</strong>${escapeHtml(record.data.visibility || '—')}</div>
      <div class="summary-item"><strong>Zona visible</strong>${escapeHtml(record.data.visibleArea || '—')}</div>
      <div class="summary-item"><strong>Aparcament</strong>${escapeHtml(record.data.parking || '—')}</div>
      <div class="summary-item"><strong>Accessos</strong>${escapeHtml(record.data.access || '—')}</div>
      <div class="summary-item"><strong>Fotos</strong>${record.photos.length}</div>
      <div class="summary-item"><strong>Document</strong>${record.document ? escapeHtml(record.document.name) : 'No'}</div>
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
  }, err => {
    alert(`No s'ha pogut obtenir la ubicació: ${err.message}`);
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
}

function saveDraft(refs, record) {
  saveFormToRecord(refs, record);
  if (record.status !== 'modificat' && record.status !== 'enviat') record.status = 'esborrany';
  upsertRecord(record);
  alert('Registre guardat al dispositiu.');
}

async function submitRecord(id, forceResend = false) {
  const record = getRecord(id);
  if (!record) return;

  const fileBase = slugify(record.data.placeName || 'zoo') + '_' + (record.data.obsDate || todayLocal()) + `_v${record.version}`;
  const payload = {
    fileBase,
    record,
    exportedAt: new Date().toISOString()
  };

  if (!API_BASE) {
    record.status = 'enviat';
    record.sentVersions.push({ version: record.version, sentAt: new Date().toISOString(), mode: 'local-demo' });
    upsertRecord(record);
    downloadJson(`${fileBase}.json`, payload);
    alert(forceResend ? 'S’ha generat de nou el fitxer local de la versió actual.' : 'Primera base feta: el registre s’ha marcat com enviat i s’ha descarregat un JSON de prova. Quan tenguem el servidor, aquí es farà la pujada real.');
    currentView = 'sent';
    render();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    record.status = 'enviat';
    if (!forceResend) record.sentVersions.push({ version: record.version, sentAt: new Date().toISOString(), mode: 'server' });
    upsertRecord(record);
    alert('Registre enviat correctament.');
    currentView = 'sent';
    render();
  } catch (error) {
    alert(`No s'ha pogut enviar. El registre queda guardat localment.\n\n${error.message}`);
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
  alert(`Hi ha ${pending.length} registres pendents. En aquesta primera versió, la pujada real quedarà activa quan connectem l’API.`);
}

function startCountdown(targetInput, dateInput, out) {
  const update = () => {
    if (!targetInput.value || !dateInput.value) { out.textContent = '—'; return; }
    const target = new Date(`${dateInput.value}T${targetInput.value}`);
    const diff = target.getTime() - Date.now();
    if (Number.isNaN(target.getTime())) { out.textContent = '—'; return; }
    if (diff <= 0) { out.textContent = 'Ara pots fer la comprovació'; return; }
    const total = Math.floor(diff / 1000);
    const h = String(Math.floor(total / 3600)).padStart(2,'0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2,'0');
    const s = String(total % 60).padStart(2,'0');
    out.textContent = `${h}:${m}:${s}`;
  };
  update();
  targetInput.addEventListener('input', update);
  dateInput.addEventListener('input', update);
  countdownTimer = setInterval(update, 1000);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function formatDateTime(iso) {
  try { return new Date(iso).toLocaleString('ca-ES'); }
  catch { return iso; }
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

render();
