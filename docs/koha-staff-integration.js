/**
 * Integracion del Asistente MARC21 con el editor basico de catalogacion Koha.
 * Pegue TODO este archivo en la preferencia del sistema IntranetUserJS.
 */
(function () {
  "use strict";

  function initializeMarc21Assistant() {

  const ASSISTANT_ORIGIN = "https://marc21.onrender.com";
  const ASSISTANT_URL = ASSISTANT_ORIGIN + "/?koha=1";
  const CATALOGUING_PATH = "/cgi-bin/koha/cataloguing/addbiblio.pl";

  if (window.location.pathname !== CATALOGUING_PATH) return;
  if (document.getElementById("marc21-assistant-launcher")) return;

  let assistantFrame;

  function dispatchValue(element, value) {
    element.value = value == null ? "" : String(value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function occurrences(record) {
    const result = [];
    if (record.leader) result.push({ tag: "000", value: record.leader });

    Object.keys(record).sort().forEach(function (tag) {
      if (["leader", "001", "005"].includes(tag) || !/^\d{3}$/.test(tag) || record[tag] == null) return;
      const values = Array.isArray(record[tag]) ? record[tag] : [record[tag]];
      values.forEach(function (value) { result.push({ tag: tag, value: value }); });
    });
    return result;
  }

  function tagNodes(tag) {
    return Array.from(document.querySelectorAll('.tag[id^="tag_' + tag + '_"]'));
  }

  function ensureTagOccurrence(tag, position) {
    let nodes = tagNodes(tag);
    while (nodes.length <= position) {
      const source = nodes[nodes.length - 1];
      const repeat = source && source.querySelector(".buttonPlus");
      if (!repeat) return null;
      repeat.click();
      const updated = tagNodes(tag);
      if (updated.length === nodes.length) return null;
      nodes = updated;
    }
    return nodes[position];
  }

  function editorForSubfield(tagNode, tag, code) {
    const codeInput = tagNode.querySelector(
      'input[name^="tag_' + tag + '_code_' + code + '_"]'
    );
    if (codeInput) {
      const line = codeInput.closest(".subfield_line") || codeInput.parentElement;
      const editor = line && line.querySelector(".input_marceditor");
      if (editor) return editor;
    }
    // Control fields can have no hidden code input. Locate the actual editor
    // inside this occurrence; never select an indicator or another MARC tag.
    if (tag === "000" || Number(tag) < 10) {
      return tagNode.querySelector('input.input_marceditor, textarea.input_marceditor, select.input_marceditor') ||
        tagNode.querySelector('input[name^="tag_' + tag + '_subfield_"], textarea[name^="tag_' + tag + '_subfield_"], select[name^="tag_' + tag + '_subfield_"]');
    }
    return tagNode.querySelector('input.input_marceditor[name^="tag_' + tag + '_subfield_' + code + '_"], textarea.input_marceditor[name^="tag_' + tag + '_subfield_' + code + '_"], select.input_marceditor[name^="tag_' + tag + '_subfield_' + code + '_"]');
  }

  function fillOccurrence(item, position, skipped) {
    const node = ensureTagOccurrence(item.tag, position);
    if (!node) {
      skipped.push(item.tag + " (etiqueta no disponible o no repetible)");
      return;
    }

    if (item.tag === "000" || Number(item.tag) < 10) {
      const control = editorForSubfield(node, item.tag, "@");
      const value = item.value && typeof item.value === "object"
        ? (item.value.value || "") : item.value;
      if (control) dispatchValue(control, value);
      else skipped.push(item.tag + " (control no encontrado)");
      return;
    }

    const field = item.value || {};
    const indicators = node.querySelectorAll("input.indicator");
    if (indicators[0]) dispatchValue(indicators[0], field.ind1 || "");
    if (indicators[1]) dispatchValue(indicators[1], field.ind2 || "");

    Object.keys(field).forEach(function (code) {
      if (code === "ind1" || code === "ind2" || field[code] == null || field[code] === "") return;
      const editor = editorForSubfield(node, item.tag, code);
      if (editor) dispatchValue(editor, field[code]);
      else skipped.push(item.tag + "$" + code + " (subcampo no incluido en el framework)");
    });
  }

  function importRecord(record) {
    if (!record || typeof record !== "object") throw new Error("Registro MARC invalido");
    if (!window.confirm("Se reemplazaran en el formulario los campos incluidos en el registro generado. ¿Continuar?")) return;

    const used = Object.create(null);
    const skipped = [];
    occurrences(record).forEach(function (item) {
      const position = used[item.tag] || 0;
      fillOccurrence(item, position, skipped);
      used[item.tag] = position + 1;
    });

    closeModal();
    const uniqueSkipped = Array.from(new Set(skipped));
    if (uniqueSkipped.length) {
      window.alert("Datos copiados al formulario; aún no guardados. Campos que no se pudieron copiar:\n\n" + uniqueSkipped.join("\n") + "\n\nRevise los campos indicados y el framework MARC antes de guardar. 001 y 005 se dejan a Koha.");
    } else {
      window.alert("Datos copiados al formulario. 001 y 005 se dejan a Koha. Revise los datos y use el botón Guardar de Koha.");
    }
  }

  function toggleModalSize() {
    const modal = document.getElementById("marc21-assistant-modal");
    const expanded = modal.classList.toggle("marc21-expanded");
    const button = document.getElementById("marc21-assistant-expand");
    button.textContent = expanded ? "Restaurar tamaño" : "Ampliar ventana";
    button.setAttribute("aria-pressed", String(expanded));
  }

  function closeModal() {
    const modal = document.getElementById("marc21-assistant-modal");
    if (modal) modal.style.display = "none";
    document.body.style.overflow = "";
  }

  function openModal() {
    document.getElementById("marc21-assistant-modal").style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  const style = document.createElement("style");
  style.textContent = [
    "#marc21-assistant-launcher{position:fixed;right:24px;bottom:24px;z-index:1040;border:0;border-radius:999px;padding:13px 18px;background:#006100;color:#fff;box-shadow:0 4px 16px #0004;font-weight:600}",
    "#marc21-assistant-modal{display:none;position:fixed;inset:0;z-index:2000;background:#0008;align-items:center;justify-content:center;padding:24px}",
    "#marc21-assistant-dialog{width:min(1200px,96vw);height:92vh;background:#fff;border-radius:8px;box-shadow:0 12px 40px #0007;display:flex;flex-direction:column;overflow:hidden}",
    "#marc21-assistant-header{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#004d40;color:#fff}",
    "#marc21-assistant-modal.marc21-expanded{padding:0}",
    "#marc21-assistant-modal.marc21-expanded #marc21-assistant-dialog{width:100%;height:100%;max-width:none;border-radius:0}",
    "#marc21-assistant-actions{display:flex;align-items:center;gap:12px}",
    "#marc21-assistant-expand{border:1px solid #ffffff80;border-radius:5px;background:transparent;color:#fff;padding:6px 10px;cursor:pointer}",
    "#marc21-assistant-launcher{display:flex;align-items:center;gap:8px}",
    "#marc21-assistant-close{border:0;background:transparent;color:#fff;font-size:28px;line-height:1}",
    "#marc21-assistant-frame{width:100%;height:100%;border:0;background:#fff}"
  ].join("");
  document.head.appendChild(style);

  const launcher = document.createElement("button");
  launcher.id = "marc21-assistant-launcher";
  launcher.type = "button";
  launcher.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 3l2.4 6.6L19 12l-6.6 2.4L10 21l-2.4-6.6L1 12l6.6-2.4L10 3zM19 1l1.1 3L23 5l-2.9 1L19 9l-1.1-3L15 5l2.9-1L19 1zM20 16l.8 2.2L23 19l-2.2.8L20 22l-.8-2.2L17 19l2.2-.8L20 16z"/></svg> Asistente IA';
  launcher.addEventListener("click", openModal);

  const modal = document.createElement("div");
  modal.id = "marc21-assistant-modal";
  modal.innerHTML = '<div id="marc21-assistant-dialog" role="dialog" aria-modal="true" aria-label="Asistente MARC21">' +
    '<div id="marc21-assistant-header"><strong>Asistente de catalogacion MARC21</strong>' +
    '<div id="marc21-assistant-actions"><button id="marc21-assistant-expand" type="button" aria-pressed="false" aria-controls="marc21-assistant-dialog">Ampliar ventana</button>' +
    '<button id="marc21-assistant-close" type="button" aria-label="Cerrar">&times;</button></div></div>' +
    '<iframe id="marc21-assistant-frame" title="Asistente MARC21" allow="clipboard-write"></iframe></div>';

  document.body.appendChild(launcher);
  document.body.appendChild(modal);
  assistantFrame = document.getElementById("marc21-assistant-frame");
  assistantFrame.src = ASSISTANT_URL;
  assistantFrame.addEventListener("load", function () {
    assistantFrame.contentWindow.postMessage({ type: "MARC21_KOHA_INIT", version: 1 }, ASSISTANT_ORIGIN);
  });

  document.getElementById("marc21-assistant-expand").addEventListener("click", toggleModalSize);
  document.getElementById("marc21-assistant-close").addEventListener("click", closeModal);
  modal.addEventListener("click", function (event) { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") closeModal(); });

  window.addEventListener("message", function (event) {
    if (event.origin !== ASSISTANT_ORIGIN || event.source !== assistantFrame.contentWindow) return;
    if (event.data && event.data.type === "MARC21_ASSISTANT_READY") {
      assistantFrame.contentWindow.postMessage({ type: "MARC21_KOHA_INIT", version: 1 }, ASSISTANT_ORIGIN);
    } else if (event.data && event.data.type === "MARC21_IMPORT_RECORD") {
      try { importRecord(event.data.record); }
      catch (error) { window.alert("No se pudo importar el registro: " + error.message); }
    }
  });

  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeMarc21Assistant, { once: true });
  } else {
    initializeMarc21Assistant();
  }
}());
