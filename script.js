import { selectEvidence, evidenceText, usableText, TYPE_FIELDS, COMMON_FIELDS } from './src/core/evidence.js';
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const textInput = document.getElementById("textInput");
const generateBtn = document.getElementById("generateBtn");
const output = document.getElementById("output");
const resultBlock = document.getElementById("resultBlock");
const editBtn = document.getElementById("editBtn");
const downloadBtn = document.getElementById("downloadBtn");
const importKohaBtn = document.getElementById("importKohaBtn");
const fullViewBtn = document.getElementById("fullViewBtn");
const progressFill = document.getElementById("progressFill");
const stageOcr = document.getElementById("stageOcr");
const stageStructure = document.getElementById("stageStructure");
const stageBuild = document.getElementById("stageBuild");
const pdfPreview = document.getElementById("pdfPreview");

let extractedText = "";
let extractedPageCount = null;
let uploadedImages = [];
let pdfImages = [];
let pdfDocument = null;
let pdfPages = [];
let pdfMetadata = {};
let selectedPages = [];
let lastRequestKey = "";
let inputRevision = 0;
let marcData = null;
let sourceData = null;
let lastExtractedText = "";
let isEditMode = false;
let kohaParentOrigin = null;

const API_BASE_URL = getApiBaseUrl();

function getApiBaseUrl() {
  const params = new URLSearchParams(window.location.search);
  const apiParam = params.get('api');
  if (apiParam) {
    const normalized = apiParam.replace(/\/$/, '');
    localStorage.setItem('marc21ApiBaseUrl', normalized);
    return normalized;
  }
  return (window.MARC21_API_BASE_URL || localStorage.getItem('marc21ApiBaseUrl') || '').replace(/\/$/, '');
}

function apiFetch(path, options) {
  return fetch(`${API_BASE_URL}${path}`, options);
}

function setStage(stage, status) {
  const map = { ocr: stageOcr, structure: stageStructure, build: stageBuild };
  const el = map[stage];
  if (!el) return;
  el.classList.remove('active', 'done');
  if (status === 'active') el.classList.add('active');
  if (status === 'done') el.classList.add('done');
}

function setProgress(pct) {
  progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
}

function compressImage(file, maxW = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (Math.max(w, h) > maxW) { const ratio = maxW / Math.max(w, h); w *= ratio; h *= ratio; }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function invalidateResult() {
  inputRevision++;
  sourceData = null;
  marcData = null;
  resultBlock.style.display = 'none';
  document.getElementById('verificationBlock').style.display = 'none';
}
const imageInput = document.getElementById('imageInput');
const imageDrop = document.getElementById('imageDrop');
let loadingImages = false;
async function addImages(files) {
  if (loadingImages) return;
  const valid = [...files].filter(f => f.type.startsWith('image/'));
  if (uploadedImages.length + valid.length > 5) { alert('Puedes subir hasta 5 imágenes. Elimina alguna antes de agregar más.'); return; }
  loadingImages = true;
  generateBtn.disabled = true;
  try {
    for (const file of valid) {
      const data = await compressImage(file);
      if (!uploadedImages.some(i => i.data === data)) uploadedImages.push({ data, name: file.name });
    }
    invalidateResult();
    renderImages();
  } catch (e) { alert('No se pudo leer la imagen: ' + e.message); }
  finally { loadingImages = false; generateBtn.disabled = false; imageInput.value = ''; }
}
function renderImages() {
  const list = document.getElementById('imageList');
  list.replaceChildren();
  document.getElementById('imageCount').textContent = `${uploadedImages.length}/5 imágenes`;
  uploadedImages.forEach((item, index) => {
    const card = document.createElement('div');
    const img = document.createElement('img');
    img.src = 'data:image/jpeg;base64,' + item.data;
    img.alt = `Imagen ${index + 1}: ${item.name}`;
    const label = document.createElement('span');
    label.textContent = `${index + 1}. ${item.name}`;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Eliminar';
    remove.onclick = () => { uploadedImages.splice(index, 1); invalidateResult(); renderImages(); };
    card.append(img, label, remove); list.append(card);
  });
}
imageDrop.onclick = () => imageInput.click();
imageInput.onchange = () => addImages(imageInput.files);
imageDrop.ondragover = e => e.preventDefault();
imageDrop.ondrop = e => { e.preventDefault(); addImages(e.dataTransfer.files); };

dropZone.addEventListener("click", () => { fileInput.click(); });
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => { dropZone.classList.remove("dragover"); });
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const files = e.dataTransfer.files;
  if (files.length) { fileInput.files = files; handlePdf(files[0]); }
});
fileInput.addEventListener("change", () => { if (fileInput.files.length) handlePdf(fileInput.files[0]); });

async function renderPdfPageAsImage(pdf, pageNum, scale = 2) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function prepareEvidence() {
  const selected = selectEvidence(pdfPages, getSelectedFormat());
  const images = [];
  const textPages = [];
  for (const page of selected) {
    if (usableText(page.text)) textPages.push(page);
    else if (images.length < 5) {
      const data = (await renderPdfPageAsImage(pdfDocument, page.page, 1.5)).split(',')[1];
      images.push({ page: page.page, label: `Página ${page.page}`, data });
    }
  }
  return { selected, images, text: evidenceText(textPages) };
}
async function handlePdf(file) {
  if (file.type !== 'application/pdf') { alert('Solo se aceptan PDFs'); return; }
  generateBtn.disabled = true;
  invalidateResult();
  pdfImages = []; pdfPages = []; extractedText = ''; extractedPageCount = null;
  dropZone.querySelector('p').textContent = `Leyendo localmente: ${file.name}…`;
  try {
    if (pdfDocument) await pdfDocument.destroy();
    pdfDocument = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    extractedPageCount = pdfDocument.numPages;
    const meta = await pdfDocument.getMetadata().catch(() => ({ info: {} }));
    pdfMetadata = Object.fromEntries(['Title','Author','Creator','Producer','CreationDate','ModDate','Language'].filter(k => meta.info?.[k]).map(k => [k, meta.info[k]]));
    for (let page = 1; page <= extractedPageCount; page++) {
      const p = await pdfDocument.getPage(page);
      const content = await p.getTextContent();
      pdfPages.push({ page, text: content.items.map(i => i.str + (i.hasEOL ? '\n' : ' ')).join('') });
      p.cleanup();
    }
    const evidence = await prepareEvidence();
    selectedPages = evidence.selected.map(p => p.page);
    pdfImages = evidence.images;
    extractedText = evidence.text;
    pdfPreview.style.display = 'block';
    pdfPreview.querySelector('.pdf-thumbnails').textContent = `Fuentes seleccionadas: páginas ${selectedPages.join(', ')}. OCR necesario en ${pdfImages.length}.`;
    dropZone.querySelector('p').textContent = `${file.name}: ${extractedPageCount} páginas leídas localmente; ${selectedPages.length} seleccionadas.`;
  } catch (e) {
    pdfDocument = null; pdfPages = []; pdfImages = []; extractedText = ''; extractedPageCount = null;
    pdfPreview.style.display = 'none';
    dropZone.querySelector('p').textContent = 'Arrastra y suelta un PDF aquí';
    alert('Error al procesar PDF: ' + e.message);
  } finally { generateBtn.disabled = false; }
}

function getSelectedStandard() { return 'RDA'; }
function getSelectedFormat() {
  const checked = document.querySelector('input[name="format"]:checked');
  return checked ? checked.value : 'book';
}
async function generateMarc() {
  let text = [extractedText, textInput.value.trim() ? '[Texto aportado]\n' + textInput.value.trim() : '', extractedPageCount ? '[Metadatos PDF]\n' + JSON.stringify({ ...pdfMetadata, technicalPageCount: extractedPageCount }) : ''].filter(Boolean).join('\n\n');
  if (!text && pdfImages.length === 0 && uploadedImages.length === 0) {
    alert("Por favor, ingresa texto, selecciona un archivo PDF o sube imágenes");
    return;
  }

  const standard = getSelectedStandard();
  const format = getSelectedFormat();
  const agency = '';
  const catLang = 'spa';

  const imagesPayload = [...uploadedImages.map((i, n) => ({ label: `Imagen ${n + 1}`, data: i.data })), ...pdfImages.slice(0, 5 - uploadedImages.length)];

  const requestRevision = inputRevision;
  const requestKey = JSON.stringify({ text, format, images: imagesPayload });
  generateBtn.disabled = true;
  generateBtn.textContent = "Procesando...";
  output.textContent = "";
  resultBlock.style.display = "block";
  setProgress(0);
  setStage('ocr', '');
  setStage('structure', '');
  setStage('build', '');

  try {
    if (sourceData && requestKey === lastRequestKey) {
      setProgress(50);
      setStage('build', 'active');
      const res = await apiFetch('/api/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourceData, standard, agency, format, catLang, pageCount: extractedPageCount, text: text })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      if (requestRevision !== inputRevision) throw new Error("Los datos cambiaron durante el análisis. Genera el registro de nuevo.");
      marcData = data.result;
      setProgress(100);
      setStage('build', 'done');
    } else {
      const hasOcr = imagesPayload.length > 0;
      if (hasOcr) { setProgress(10); setStage('ocr', 'active'); }
      else { setProgress(20); setStage('structure', 'active'); }
      const res = await apiFetch('/api/extract-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          standard,
          agency,
          format,
          catLang,
          pageCount: extractedPageCount,
          images: imagesPayload
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      if (hasOcr) { setProgress(60); setStage('ocr', 'done'); setStage('structure', 'active'); }
      else { setProgress(50); setStage('structure', 'active'); }

      const data = await res.json();
      if (requestRevision !== inputRevision) throw new Error("Los datos cambiaron durante el análisis. Genera el registro de nuevo.");
      marcData = data.result;
      sourceData = data.source;
      lastRequestKey = requestKey;
      lastExtractedText = text;

      setProgress(90);
      setStage('structure', 'done');
      setStage('build', 'active');

      renderVerification(sourceData);
      document.getElementById('verificationBlock').style.display = 'block';

      setProgress(100);
      setStage('build', 'done');
    }

    renderMarc(marcData);
    generateBtn.textContent = "Generar registro MARC21";
    generateBtn.disabled = false;
  } catch (error) {
    output.textContent = "Error: " + error.message;
    document.getElementById('verificationBlock').style.display = 'none';
    generateBtn.textContent = "Generar registro MARC21";
    generateBtn.disabled = false;
    setStage('ocr', '');
    setStage('structure', '');
    setStage('build', '');
    setProgress(0);
  } finally { await refreshMetrics(); }
}

function subfieldSort(a, b) {
  const ca = a.match(/^\$([a-z0-9])/)?.[1] || '';
  const cb = b.match(/^\$([a-z0-9])/)?.[1] || '';
  const aNum = /^\d$/.test(ca);
  const bNum = /^\d$/.test(cb);
  if (aNum && !bNum) return 1;
  if (!aNum && bNum) return -1;
  return ca.localeCompare(cb);
}

function renderFieldToHtml(tag, field) {
  const subfields = [];
  let indStr = '';
  const hasIndicators = 'ind1' in field || 'ind2' in field;

  if (hasIndicators) {
    const ind1 = field.ind1 || '';
    const ind2 = field.ind2 || '';
    if (ind1 || ind2) indStr = ind1 + ind2;
    for (const [key, value] of Object.entries(field)) {
      if (key !== 'ind1' && key !== 'ind2' && value) subfields.push('$' + key + value);
    }
  } else {
    for (const [key, value] of Object.entries(field)) {
      if (value) subfields.push('$' + key + value);
    }
  }

  subfields.sort(subfieldSort);

  if (subfields.length > 0) {
    const indPart = indStr ? indStr + ' ' : '';
    return `<div class="marc-field"><span class="marc-tag">${tag}</span> ${indPart}<span class="marc-subfield">${escapeHtml(subfields.join(' '))}</span></div>`;
  }
  return '';
}

function renderMarc(data) {
  let html = '';

  if (data.leader) html += `<div class="marc-field"><span class="marc-tag">LDR</span> ${escapeHtml(data.leader)}</div>`;
  if (data['001']) {
    const val = data['001'].value || data['001'];
    if (val) html += `<div class="marc-field"><span class="marc-tag">001</span> ${escapeHtml(val)}</div>`;
  }
  if (data['005']) html += `<div class="marc-field"><span class="marc-tag">005</span> ${escapeHtml(data['005'])}</div>`;
  if (data['008']) html += `<div class="marc-field"><span class="marc-tag">008</span> ${escapeHtml(data['008'])}</div>`;

  const fields = ['020', '022', '024', '040', '041', '050', '082', '100', '111', '245', '250', '260', '264', '300', '336', '337', '338', '490', '500', '502', '504', '520', '600', '648', '650', '700', '710', '711', '773', '856'];

  for (const tag of fields) {
    if (data[tag]) {
      if (Array.isArray(data[tag])) {
        for (const f of data[tag]) html += renderFieldToHtml(tag, f);
      } else {
        html += renderFieldToHtml(tag, data[tag]);
      }
    }
  }

  output.innerHTML = html;
}

let isFullView = false;

function toggleFullView() {
  isFullView = !isFullView;
  const container = document.getElementById('output');
  const btn = document.getElementById('fullViewBtn');
  if (isFullView) {
    container.classList.add('fullview');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cerrar vista ampliada';
    document.body.style.overflow = 'hidden';
  } else {
    container.classList.remove('fullview');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg> Vista ampliada';
    document.body.style.overflow = '';
  }
}

function renderVerification(source) {
  const tbody = document.getElementById('verificationBody');
  if (!source) { tbody.innerHTML = ''; return; }

  const fields = [
    { key: 'title', label: 'Título' },
    { key: 'subtitle', label: 'Subtítulo' },
    { key: 'author', label: 'Autor(es)' },
    { key: 'publisher', label: 'Editorial' },
    { key: 'place', label: 'Lugar de publicación' },
    { key: 'year', label: 'Año' },
    { key: 'copyrightYear', label: 'Año de copyright' },
    { key: 'isbn', label: 'ISBN' },
    { key: 'doi', label: 'DOI' },
    { key: 'edition', label: 'Edición' },
    { key: 'pages', label: 'Páginas' },
    { key: 'subjects', label: 'Materias' },
    { key: 'language', label: 'Idioma' },
    { key: 'series', label: 'Serie' },
    { key: 'hostTitle', label: 'Título de la revista/libro' },
    { key: 'volume', label: 'Volumen' },
    { key: 'issue', label: 'Número' },
    { key: 'degree', label: 'Grado académico' },
    { key: 'institution', label: 'Institución' },
    { key: 'advisor', label: 'Asesor/Director' },
    { key: 'meetingName', label: 'Nombre del evento' },
    { key: 'meetingDate', label: 'Fecha del evento' },
    { key: 'meetingPlace', label: 'Lugar del evento' },
    { key: 'notes', label: 'Resumen' },
    { key: 'dewey', label: 'Clasificación Dewey' },
  ];

  let html = '';

  for (const f of fields) {
    let value = source[f.key];

    if (f.key === 'author') {
      const names = Array.isArray(source.author) ? source.author : [];
      const roles = source.authorRoles || {};
      const validRoles = ['autor', 'coordinador', 'compilador', 'editor', 'traductor', 'prologuista', 'ilustrador', 'asesor'];
      value = names.map(n => {
        const role = roles[n] || '';
        const validRole = validRoles.includes(role) ? role : '';
        return validRole ? n + ' (' + validRole + ')' : n;
      }).join(', ');
    } else if (Array.isArray(value)) {
      value = value.filter(Boolean).join(', ');
    } else {
      value = String(value || '');
    }

    const isEmpty = !value || value === '' || value === '(dejar vacio)' || value === '(dejar vacio si no se encuentra)';
    const isDefault = value === '[Sin titulo]' || value === '[editor no identificado]' || value === '[Lugar de publicacion no identificado]';
    if (![...COMMON_FIELDS, ...(TYPE_FIELDS[getSelectedFormat()] || [])].includes(f.key)) continue;
    const ev = source.evidence?.[f.key];
    const snippet = ev?.quote || null;
    const hasSnippet = ev?.verified === true;

    let statusClass, statusText;
    if (isDefault) { statusClass = 'status-warn'; statusText = 'Valor por defecto'; }
    else if (isEmpty) { statusClass = 'status-missing'; statusText = 'No encontrado'; }
    else if (ev?.status === 'proposed') { statusClass = 'status-warn'; statusText = 'Propuesta automática'; }
    else if (ev?.status === 'ambiguous') { statusClass = 'status-warn'; statusText = 'Ambiguo: revisar'; }
    else if (hasSnippet) { statusClass = 'status-ok'; statusText = 'Cita localizada ✓'; }
    else { statusClass = 'status-warn'; statusText = 'Extraído (no verif.)'; }

    const displayValue = isEmpty && !isDefault ? '' : value;

    html += '<tr><td>' + escapeHtml(f.label) + '</td><td>' + escapeHtml(displayValue) + '</td>';
    html += '<td class="' + statusClass + '">' + statusText + '</td>';
    html += '<td>' + escapeHtml((ev?.source || 'Sin fuente') + (ev?.basis === 'copyright' ? ' · Año tomado del copyright' : '')) + '</td><td>' + escapeHtml(snippet || 'Sin evidencia literal') + '</td></tr>';
  }

  tbody.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const escapeXml = (text) => {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
};

function fieldToXml(tag, field) {
  const hasIndicators = 'ind1' in field || 'ind2' in field;
  let ind1 = ' ';
  let ind2 = ' ';
  const subfields = [];

  if (hasIndicators) {
    ind1 = field.ind1 || ' ';
    ind2 = field.ind2 || ' ';
    for (const [key, value] of Object.entries(field)) {
      if (key !== 'ind1' && key !== 'ind2' && value) subfields.push({ code: key, value });
    }
  } else {
    for (const [key, value] of Object.entries(field)) {
      if (value) subfields.push({ code: key, value });
    }
  }

  subfields.sort((a, b) => {
    const aNum = /^\d$/.test(a.code);
    const bNum = /^\d$/.test(b.code);
    if (aNum && !bNum) return 1;
    if (!aNum && bNum) return -1;
    return a.code.localeCompare(b.code);
  });

  if (subfields.length > 0) {
    let xml = `  <datafield ind1="${ind1}" ind2="${ind2}" tag="${tag}">\n`;
    for (const sf of subfields) xml += `    <subfield code="${sf.code}">${escapeXml(sf.value)}</subfield>\n`;
    xml += `  </datafield>\n`;
    return xml;
  }
  return '';
}

function downloadMarc() {
  if (!marcData) return;

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<record xmlns="http://www.loc.gov/MARC21/slim">\n';

  if (marcData.leader) xml += `  <leader>${escapeXml(marcData.leader)}</leader>\n`;
  if (marcData['001']) {
    const val = marcData['001'].value || marcData['001'];
    if (val) xml += `  <controlfield tag="001">${escapeXml(val)}</controlfield>\n`;
  }
  if (marcData['005']) xml += `  <controlfield tag="005">${escapeXml(marcData['005'])}</controlfield>\n`;
  if (marcData['008']) xml += `  <controlfield tag="008">${escapeXml(marcData['008'])}</controlfield>\n`;

  const dataFields = ['020', '022', '024', '040', '041', '050', '082', '100', '111', '245', '250', '260', '264', '300', '336', '337', '338', '490', '500', '502', '504', '520', '600', '648', '650', '700', '710', '711', '773', '856', '883'];

  for (const tag of dataFields) {
    if (marcData[tag]) {
      if (Array.isArray(marcData[tag])) {
        for (const f of marcData[tag]) xml += fieldToXml(tag, f);
      } else {
        xml += fieldToXml(tag, marcData[tag]);
      }
    }
  }

  xml += '</record>';

  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'registro.xml';
  a.click();
  URL.revokeObjectURL(url);
}

function importMarcIntoKoha() {
  if (!marcData || !kohaParentOrigin || window.parent === window) return;

  // If the cataloguer edited the raw view, apply those changes first.
  if (isEditMode) {
    const editor = document.getElementById("marcEditor");
    if (editor) {
      try {
        marcData = { ...parseRawMarc(editor.value), ...(marcData['883'] ? { '883': { ...marcData['883'], ind1: '1' } } : {}) };
      } catch (error) {
        alert("No se puede importar: revisa el formato del registro editado.");
        return;
      }
    }
  }

  window.parent.postMessage({
    type: "MARC21_IMPORT_RECORD",
    version: 1,
    record: marcData
  }, kohaParentOrigin);
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.data?.type !== "MARC21_KOHA_INIT") return;
  kohaParentOrigin = event.origin;
  importKohaBtn.style.display = "inline-block";
});

if (window.parent !== window) {
  // This message contains no catalogue data; the parent answers with a
  // same-origin handshake which is then used for every sensitive message.
  window.parent.postMessage({ type: "MARC21_ASSISTANT_READY", version: 1 }, "*");
}

function toggleEditMode() {
  isEditMode = !isEditMode;

  if (isEditMode) {
    const rawMarc = formatMarcForEdit(marcData);
    output.innerHTML = `<textarea id="marcEditor" class="edit-mode" style="width:100%;min-height:300px;font-family:monospace;">${escapeHtml(rawMarc)}</textarea>`;
    editBtn.textContent = "Guardar cambios";
  } else {
    const editor = document.getElementById("marcEditor");
    const rawText = editor.value;
    try {
      marcData = { ...parseRawMarc(rawText), ...(marcData['883'] ? { '883': { ...marcData['883'], ind1: '1' } } : {}) };
      renderMarc(marcData);
      editBtn.textContent = "Editar";
    } catch (e) {
      alert("Error al parsear el registro. Verifica el formato.");
    }
  }
}

function fieldToEditLine(tag, field) {
  const hasIndicators = 'ind1' in field || 'ind2' in field;
  let line = '=' + tag + '  ';

  if (hasIndicators) {
    const ind1 = field.ind1 || '';
    const ind2 = field.ind2 || '';
    const subfields = [];
    for (const [key, value] of Object.entries(field)) {
      if (key !== 'ind1' && key !== 'ind2' && value) subfields.push('$' + key + value);
    }
    subfields.sort(subfieldSort);
    line += ind1 + ind2 + (subfields.length > 0 ? subfields.join(' ') : '');
  } else {
    const subfields = [];
    for (const [key, value] of Object.entries(field)) {
      if (value) subfields.push('$' + key + value);
    }
    subfields.sort(subfieldSort);
    line += subfields.join(' ');
  }

  return line;
}

function formatMarcForEdit(data) {
  const lines = [];

  if (data.leader) lines.push('=LDR  ' + data.leader);
  if (data['001']) {
    const val = data['001'].value || data['001'];
    if (val) lines.push('=001  ' + val);
  }
  if (data['005']) lines.push('=005  ' + data['005']);
  if (data['008']) lines.push('=008  ' + data['008']);

  const dataFields = ['020', '022', '024', '040', '041', '050', '082', '100', '111', '245', '250', '260', '264', '300', '336', '337', '338', '490', '500', '502', '504', '520', '600', '648', '650', '700', '710', '711', '773', '856'];

  for (const tag of dataFields) {
    if (data[tag]) {
      if (Array.isArray(data[tag])) {
        for (const f of data[tag]) lines.push(fieldToEditLine(tag, f));
      } else {
        lines.push(fieldToEditLine(tag, data[tag]));
      }
    }
  }

  return lines.join('\n');
}

function parseRawMarc(raw) {
  const lines = raw.split('\n').filter(l => l.trim());
  const data = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('=LDR')) {
      data.leader = trimmed.substring(5).trim();
    } else if (trimmed.startsWith('=001')) {
      const value = trimmed.substring(6).trim();
      data['001'] = { value };
    } else if (trimmed.startsWith('=005') && trimmed.length > 6) {
      data['005'] = trimmed.substring(6).trim();
    } else if (trimmed.startsWith('=008') && trimmed.length > 6) {
      data['008'] = trimmed.substring(6).trim();
    } else if (trimmed.startsWith('=') && trimmed.length >= 5 && !isNaN(parseInt(trimmed.substring(1, 4)))) {
      const tag = trimmed.substring(1, 4);
      const content = trimmed.substring(6).trim();

      const field = {};
      if (content.length >= 2) {
        const ind1 = content.substring(0, 1);
        const ind2 = content.substring(1, 2);

        if (ind1 === ' ' || ind1 === '0' || ind1 === '1' || ind1 === '2' || ind1 === '3' || ind1 === '4') {
          field.ind1 = ind1;
          field.ind2 = ind2;
          const rest = content.substring(2);
          if (rest.includes('$')) {
            const subfieldMatches = rest.matchAll(/\$([a-z])([^$]+)/g);
            for (const match of subfieldMatches) field[match[1]] = match[2];
          } else if (rest.trim()) {
            field.a = rest.trim();
          }
        } else {
          if (content.includes('$')) {
            const subfieldMatches = content.matchAll(/\$([a-z])([^$]+)/g);
            for (const match of subfieldMatches) field[match[1]] = match[2];
          } else if (content.trim()) {
            field.a = content.trim();
          }
        }
      }

      if (data[tag]) {
        if (Array.isArray(data[tag])) { data[tag].push(field); }
        else { data[tag] = [data[tag], field]; }
      } else {
        data[tag] = field;
      }
    }
  }

  return data;
}

function copyMarc() {
  const editor = document.getElementById("marcEditor");
  let text;
  if (editor) {
    text = editor.value;
  } else if (marcData) {
    text = formatMarcForEdit(marcData);
  } else {
    text = output.textContent || output.innerText;
  }
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copiado';
    setTimeout(() => btn.innerHTML = orig, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  });
}

document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('como-funciona').classList.toggle('collapsed');
});

generateBtn.addEventListener("click", generateMarc);
editBtn.addEventListener("click", toggleEditMode);
downloadBtn.addEventListener("click", downloadMarc);
importKohaBtn.addEventListener("click", importMarcIntoKoha);
fullViewBtn?.addEventListener("click", toggleFullView);
document.getElementById('copyBtn')?.addEventListener("click", copyMarc);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isFullView) toggleFullView();
});

document.querySelectorAll('input[name="format"]').forEach(el => {
  el.addEventListener("change", async () => {
    invalidateResult();
    if (pdfDocument) {
      generateBtn.disabled = true;
      try {
        const e = await prepareEvidence(); extractedText = e.text; pdfImages = e.images; selectedPages = e.selected.map(p => p.page);
        pdfPreview.querySelector('.pdf-thumbnails').textContent = `Fuentes seleccionadas: páginas ${selectedPages.join(', ')}. OCR necesario en ${pdfImages.length}.`;
      } catch (error) { alert('No se pudo preparar la evidencia: ' + error.message); }
      finally { generateBtn.disabled = false; }
    }
  });
});

textInput.addEventListener("input", () => {
  invalidateResult();
  const val = textInput.value.trim();
  if (val && val !== lastExtractedText) {
    sourceData = null;
    document.getElementById('verificationBlock').style.display = 'none';
  }
});

async function refreshMetrics() {
  const status = document.getElementById('metricsStatus');
  try {
    const response = await apiFetch('/api/metrics');
    if (!response.ok) throw new Error('No se pudieron cargar las métricas');
    const data = await response.json();
    const number = value => Number(value || 0).toLocaleString('es-MX');
    document.getElementById('metricsLibrary').textContent = data.libraryName;
    document.getElementById('metricsStorage').textContent = data.storage === 'local-demo' ? 'Demo: historial en archivo local del servidor. En Render sin disco persistente se pierde al reiniciar o desplegar.' : 'Historial en la ruta configurada del servidor. Su permanencia depende del almacenamiento contratado.';
    document.getElementById('metricsCompleted').textContent = number(data.completed);
    document.getElementById('metricsBooks').textContent = number(data.byType.book);
    document.getElementById('metricsTokens').textContent = number(data.totalTokens);
    document.getElementById('metricsBookTokens').textContent = number(data.bookTokens);
    document.getElementById('metricsBookAverage').textContent = data.averageTokensPerBook === null ? '—' : number(data.averageTokensPerBook);
    document.getElementById('metricsBookInputAverage').textContent = data.averageInputTokensPerBook === null ? '—' : number(data.averageInputTokensPerBook);
    document.getElementById('metricsBookOutputAverage').textContent = data.averageOutputTokensPerBook === null ? '—' : number(data.averageOutputTokensPerBook);
    const percent = value => value === null ? '—' : `${(Number(value) * 100).toLocaleString('es-MX', {maximumFractionDigits:1})}%`;
    document.getElementById('metricsOcrRate').textContent = `${number(data.booksWithOcr)} (${percent(data.ocrBookRate)})`;
    document.getElementById('metricsRetryRate').textContent = percent(data.retryRate);
    document.getElementById('metricsFailureRate').textContent = percent(data.failureRate);
    document.getElementById('metricsBookCoverage').textContent = `Promedio calculado sobre ${number(data.bookUsage.count)} libros generados con desglose disponible; excluye otros materiales y solicitudes fallidas.${data.bookUsageComplete ? '' : ' Historial o reporte de uso incompleto: cifras parciales.'}`;
    document.getElementById('metricsTokenDetail').textContent = `Entrada: ${number(data.inputTokens)} · Salida: ${number(data.outputTokens)} · Entrada en caché: ${number(data.cachedTokens)}`;
    document.getElementById('metricsLimit').textContent = data.limit === null ? 'Sin límite configurado' : `${number(data.completed)} / ${number(data.limit)} registros · ${number(data.remaining)} disponibles`;
    const progress = document.getElementById('metricsQuota');
    progress.max = data.limit || 1; progress.value = data.limit === null ? 0 : Math.min(data.completed, data.limit || 1);
    progress.hidden = data.limit === null;
    status.textContent = `${number(data.failed)} fallidos · ${number(data.inProgress)} en proceso · ${number(data.calls)} llamadas. ${data.unreportedCalls ? number(data.unreportedCalls) + ' llamadas sin uso reportado; total de tokens parcial.' : 'Tokens reportados por la API.'}`;
    const list = document.getElementById('metricsRecent'); list.replaceChildren();
    for (const item of data.recent.slice(0,10)) {
      const row = document.createElement('tr');
      for (const value of [new Date(item.date).toLocaleString('es-MX'), item.title || 'Sin título registrado', item.format === 'book' ? 'Libro' : item.format, item.status === 'completed' ? 'Generado' : 'Fallido', number(item.inputTokens), number(item.outputTokens), number(item.inputTokens+item.outputTokens) + (item.unreportedCalls ? ' (parcial)' : ''), item.id]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      list.append(row);
    }
  } catch (error) { status.textContent = error.message; }
}
document.getElementById('refreshMetrics').addEventListener('click', refreshMetrics);
refreshMetrics();
