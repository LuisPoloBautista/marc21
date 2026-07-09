const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const textInput = document.getElementById("textInput");
const generateBtn = document.getElementById("generateBtn");
const output = document.getElementById("output");
const resultBlock = document.getElementById("resultBlock");
const editBtn = document.getElementById("editBtn");
const downloadBtn = document.getElementById("downloadBtn");
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
let marcData = null;
let sourceData = null;
let lastExtractedText = "";
let isEditMode = false;

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

const IMAGE_SLOTS = [
  { key: 'cover', label: 'Portada', multiple: false },
  { key: 'legal', label: 'Página legal', multiple: false },
  { key: 'lastpage', label: 'Última página', multiple: false },
  { key: 'other', label: 'Otras páginas', multiple: true },
];

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
      if (w > maxW) { h = h * maxW / w; w = maxW; }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function setupImageSlots() {
  for (const slot of IMAGE_SLOTS) {
    const el = document.querySelector(`.image-slot[data-slot="${slot.key}"]`);
    if (!el) continue;
    const upload = el.querySelector('.slot-upload');
    upload.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = slot.multiple;
      input.onchange = async () => {
        for (const file of input.files) {
          const data = await compressImage(file, 1200, 0.8);
          uploadedImages.push({ slot: slot.key, label: slot.label, data, file });
        }
        updateSlotUI(slot.key);
      };
      input.click();
    });
    el.addEventListener('click', () => upload.click());
  }
}

function updateSlotUI(slotKey) {
  const el = document.querySelector(`.image-slot[data-slot="${slotKey}"]`);
  if (!el) return;
  const preview = el.querySelector('.slot-preview');
  const images = uploadedImages.filter(i => i.slot === slotKey);
  el.classList.toggle('has-image', images.length > 0);
  let existingRemove = el.querySelector('.slot-remove');
  if (images.length === 0) {
    preview.innerHTML = '';
    if (existingRemove) existingRemove.remove();
    return;
  }
  const lastImg = images[images.length - 1];
  preview.innerHTML = `<img src="data:image/jpeg;base64,${lastImg.data}" alt="${lastImg.label}">`;
  if (images.length > 1) {
    const count = el.querySelector('.slot-count') || document.createElement('div');
    count.className = 'slot-count';
    count.textContent = `+${images.length - 1} más`;
    if (!el.querySelector('.slot-count')) el.appendChild(count);
  } else {
    const c = el.querySelector('.slot-count');
    if (c) c.remove();
  }
  if (!existingRemove) {
    const rm = document.createElement('div');
    rm.className = 'slot-remove';
    rm.textContent = '×';
    rm.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadedImages = uploadedImages.filter(i => i.slot !== slotKey);
      updateSlotUI(slotKey);
      sourceData = null;
      document.getElementById('verificationBlock').style.display = 'none';
    });
    el.appendChild(rm);
  }
}

setupImageSlots();

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

async function handlePdf(file) {
  if (file.type !== "application/pdf") { alert("Solo se aceptan PDFs"); return; }
  dropZone.querySelector("p").textContent = `Procesando PDF: ${file.name}...`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    extractedPageCount = pdf.numPages;

    const pagesToRender = Math.min(pdf.numPages, 4);
    pdfImages = [];
    extractedText = "";

    const thumbnailsContainer = pdfPreview.querySelector('.pdf-thumbnails') || document.createElement('div');
    thumbnailsContainer.className = 'pdf-thumbnails';
    thumbnailsContainer.innerHTML = '';
    pdfPreview.style.display = 'block';
    pdfPreview.querySelector('.pdf-thumbnails')?.remove();
    pdfPreview.appendChild(thumbnailsContainer);

    for (let i = 1; i <= pagesToRender; i++) {
      const dataUrl = await renderPdfPageAsImage(pdf, i, 1.5);
      const base64 = dataUrl.split(',')[1];

      const slotMap = { 1: 'cover', 2: 'legal', 3: 'lastpage', 4: 'other' };
      const slot = slotMap[i] || 'other';
      const labelMap = { cover: 'Portada', legal: 'Pág. legal', lastpage: 'Última pág.', other: 'Otras págs.' };

      pdfImages.push({ slot, label: labelMap[slot] || `Pág. ${i}`, data: base64 });

      const thumb = document.createElement('div');
      thumb.style.cssText = 'flex:0 0 auto;width:80px;border:2px solid #e2e8f0;border-radius:6px;overflow:hidden;';
      thumb.innerHTML = `<img src="${dataUrl}" style="width:100%;height:auto;display:block;" title="Página ${i}">`;
      thumbnailsContainer.appendChild(thumb);

      const pageText = await pdf.getPage(i).then(p =>
        p.getTextContent().then(c => c.items.map(item => item.str).join(" "))
      );
      extractedText += pageText + "\n\n";
    }

    extractedText = extractedText.trim();
    dropZone.querySelector("p").textContent = `PDF listo: ${file.name} (${pdf.numPages} pág., ${pagesToRender} págs. renderizadas como imágenes)`;
    sourceData = null;
    document.getElementById('verificationBlock').style.display = 'none';
  } catch (error) {
    alert("Error al procesar PDF: " + error.message);
    extractedText = "";
    extractedPageCount = null;
    pdfImages = [];
    pdfPreview.style.display = 'none';
  }
}

function getSelectedStandard() { return 'RDA'; }
function getSelectedFormat() {
  const checked = document.querySelector('input[name="format"]:checked');
  return checked ? checked.value : 'book';
}
function getSelectedCatLang() {
  const checked = document.querySelector('input[name="catLang"]:checked');
  return checked ? checked.value : 'spa';
}

async function regenerateFromCache() {
  if (!sourceData) return;
  const standard = getSelectedStandard();
  const format = getSelectedFormat();
  const agency = document.getElementById("agencyInput").value.trim() || 'IGN';
  const catLang = getSelectedCatLang();
  try {
    const res = await apiFetch('/api/format', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourceData, standard, agency, format: format, catLang, pageCount: extractedPageCount, text: lastExtractedText || '' })
    });
    if (!res.ok) return;
    const data = await res.json();
    marcData = data.result;
    renderMarc(marcData);
  } catch (e) { /* ignore */ }
}

async function generateMarc() {
  let text = textInput.value.trim();
  if (!text && extractedText) text = extractedText;
  if (!text && pdfImages.length === 0 && uploadedImages.length === 0) {
    alert("Por favor, ingresa texto, selecciona un archivo PDF o sube imágenes");
    return;
  }

  const standard = getSelectedStandard();
  const format = getSelectedFormat();
  const agency = document.getElementById("agencyInput").value.trim() || 'IGN';
  const catLang = getSelectedCatLang();

  const imagesPayload = [...pdfImages, ...uploadedImages.map(i => ({ slot: i.slot, label: i.label, data: i.data }))];

  generateBtn.disabled = true;
  generateBtn.textContent = "Procesando...";
  output.textContent = "";
  resultBlock.style.display = "block";
  setProgress(0);
  setStage('ocr', '');
  setStage('structure', '');
  setStage('build', '');

  try {
    if (sourceData && text === lastExtractedText && imagesPayload.length === 0) {
      setProgress(50);
      setStage('build', 'active');
      const res = await apiFetch('/api/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourceData, standard, agency, format, catLang, pageCount: extractedPageCount, text: text })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
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
      marcData = data.result;
      sourceData = data.source;
      lastExtractedText = text;

      setProgress(90);
      setStage('structure', 'done');
      setStage('build', 'active');

      const snippets = findSourceSnippets(sourceData, text);
      renderVerification(sourceData, snippets);
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
  }
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

function findSnippetInText(value, sourceText) {
  if (!value || !sourceText) return null;
  const plainValue = String(value).toLowerCase().replace(/\s+/g, ' ').trim();
  const plainSource = sourceText.toLowerCase().replace(/\s+/g, ' ');
  let idx = plainSource.indexOf(plainValue);
  if (idx === -1 && plainValue.length > 25) {
    const shortVal = plainValue.substring(0, 25);
    idx = plainSource.indexOf(shortVal);
  }
  if (idx === -1) return null;
  const ctx = 40;
  const start = Math.max(0, idx - ctx);
  const end = Math.min(sourceText.length, idx + plainValue.length + ctx);
  let snippet = sourceText.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < sourceText.length) snippet = snippet + '...';
  return snippet.trim().replace(/\s+/g, ' ');
}

function findSourceSnippets(source, sourceText) {
  if (!source || !sourceText) return {};
  const snippets = {};
  const singleFields = ['title', 'subtitle', 'publisher', 'place', 'year', 'isbn', 'doi', 'edition', 'pages', 'language', 'series', 'notes', 'hostTitle', 'volume', 'issue', 'degree', 'institution', 'advisor', 'meetingName', 'meetingDate', 'meetingPlace', 'corporate', 'dewey', 'lcClassification'];
  for (const key of singleFields) {
    const v = source[key];
    if (!v) continue;
    const s = findSnippetInText(Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v), sourceText);
    if (s) snippets[key] = s;
  }
  if (source.author && Array.isArray(source.author)) {
    const all = [];
    for (const a of source.author) {
      const s = findSnippetInText(a, sourceText);
      if (s) all.push(s);
    }
    if (all.length > 0) snippets.author = all.join('\n---\n');
  }
  if (source.subjects && Array.isArray(source.subjects)) {
    const all = [];
    for (const subj of source.subjects) {
      const s = findSnippetInText(subj, sourceText);
      if (s) all.push(s);
    }
    if (all.length > 0) snippets.subjects = all.join('\n');
  }
  return snippets;
}

let sourceTooltipEl = null;

function showSourceTooltip(event, snippet) {
  if (!sourceTooltipEl) {
    sourceTooltipEl = document.createElement('div');
    sourceTooltipEl.className = 'source-tooltip';
    document.body.appendChild(sourceTooltipEl);
  }
  sourceTooltipEl.textContent = snippet;
  sourceTooltipEl.style.display = 'block';
  const rect = event.target.getBoundingClientRect();
  let top = rect.bottom + 6;
  let left = rect.left;
  if (left + 360 > window.innerWidth) left = window.innerWidth - 370;
  if (left < 4) left = 4;
  if (top + 210 > window.innerHeight) top = rect.top - 210;
  sourceTooltipEl.style.top = top + 'px';
  sourceTooltipEl.style.left = left + 'px';
}

function hideSourceTooltip() {
  if (sourceTooltipEl) sourceTooltipEl.style.display = 'none';
}

function renderVerification(source, snippets) {
  const tbody = document.getElementById('verificationBody');
  if (!source) { tbody.innerHTML = ''; return; }

  const fields = [
    { key: 'title', label: 'Título' },
    { key: 'subtitle', label: 'Subtítulo' },
    { key: 'author', label: 'Autor(es)' },
    { key: 'publisher', label: 'Editorial' },
    { key: 'place', label: 'Lugar de publicación' },
    { key: 'year', label: 'Año' },
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
    { key: 'notes', label: 'Notas' },
    { key: 'dewey', label: 'Clasificación Dewey' },
    { key: 'lcClassification', label: 'Clasificación LC' },
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
    const snippet = snippets ? snippets[f.key] : null;
    const hasSnippet = !!snippet;

    let statusClass, statusText;
    if (isDefault) { statusClass = 'status-warn'; statusText = 'Valor por defecto'; }
    else if (isEmpty) { statusClass = 'status-missing'; statusText = 'No encontrado'; }
    else if (hasSnippet) { statusClass = 'status-ok'; statusText = 'Extraído ✓'; }
    else { statusClass = 'status-warn'; statusText = 'Extraído (no verif.)'; }

    const displayValue = isEmpty && !isDefault ? '' : value;

    html += '<tr><td>' + escapeHtml(f.label) + '</td><td>' + escapeHtml(displayValue) + '</td>';
    if (snippet) {
      html += '<td class="' + statusClass + '" data-snippet="' + escapeHtml(snippet) + '" onmouseenter="showSourceTooltip(event, this.dataset.snippet)" onmouseleave="hideSourceTooltip()">' + statusText + '</td>';
    } else {
      html += '<td class="' + statusClass + '">' + statusText + '</td>';
    }
    html += '</tr>';
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

  const dataFields = ['020', '022', '024', '040', '041', '050', '082', '100', '111', '245', '250', '260', '264', '300', '336', '337', '338', '490', '500', '502', '504', '520', '600', '648', '650', '700', '710', '711', '773', '856'];

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
      marcData = parseRawMarc(rawText);
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
fullViewBtn?.addEventListener("click", toggleFullView);
document.getElementById('copyBtn')?.addEventListener("click", copyMarc);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isFullView) toggleFullView();
});

document.querySelectorAll('input[name="format"], input[name="catLang"]').forEach(el => {
  el.addEventListener("change", () => {
    if (sourceData && marcData) regenerateFromCache();
  });
});

textInput.addEventListener("change", () => {
  const val = textInput.value.trim();
  if (val && val !== lastExtractedText) {
    sourceData = null;
    document.getElementById('verificationBlock').style.display = 'none';
  }
});
