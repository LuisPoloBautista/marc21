/**
 * Integracion TopicAuthority + Koha.
 * Pegue este archivo DESPUES de koha-staff-integration.js en IntranetUserJS.
 */
(function () {
  "use strict";

  const AUTHORITY_ORIGIN = "https://topicauthority.onrender.com";
  const AUTHORITY_URL = AUTHORITY_ORIGIN + "/?koha=1&integration=20260903b";
  const CATALOGUING_PATH = "/cgi-bin/koha/cataloguing/addbiblio.pl";
  let authorityFrame = null;
  let target650Id = null;

  function tagNumber(node) {
    const match = String(node && node.id || "").match(/^tag_(\d{3})_/);
    return match ? match[1] : "";
  }

  function fieldEditor(node, tag, code) {
    if (!node) return null;
    const codeInput = node.querySelector('input[name^="tag_' + tag + '_code_' + code + '_"]');
    const line = (codeInput && (codeInput.closest(".subfield_line") || codeInput.parentElement))
      || node.querySelector('.subfield_line[id^="subfield' + tag + code + '"]');
    return line && line.querySelector(".input_marceditor, input[id^=tag_], textarea[id^=tag_], select[id^=tag_]");
  }

  function fieldValue(node, tag, code) {
    const editor = fieldEditor(node, tag, code);
    return editor ? String(editor.value || "").trim() : "";
  }

  function setFieldValue(node, tag, code, value) {
    const editor = fieldEditor(node, tag, code);
    if (!editor) return false;
    editor.value = value || "";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function marcContext() {
    const lines = [];
    document.querySelectorAll("#f .tag").forEach(function (node) {
      const tag = tagNumber(node);
      if (!tag || tag === "650" || Number(tag) >= 900) return;
      const parts = [];
      node.querySelectorAll('.subfield_line input[name^="tag_' + tag + '_code_"]').forEach(function (codeInput) {
        const match = codeInput.name.match(new RegExp('^tag_' + tag + '_code_(.)_'));
        if (!match) return;
        const value = fieldValue(node, tag, match[1]);
        if (value) parts.push("$" + match[1] + value);
      });
      if (parts.length) lines.push("=" + tag + "  " + parts.join(" "));
    });
    return lines.join("\n");
  }

  function current650(node) {
    return ["a", "x", "y", "z", "v"]
      .map(function (code) { return fieldValue(node, "650", code); })
      .filter(Boolean)
      .join(" -- ");
  }

  function sendContext() {
    if (!authorityFrame || !authorityFrame.contentWindow) return;
    const node = document.getElementById(target650Id);
    authorityFrame.contentWindow.postMessage({
      type: "TOPIC_AUTHORITY_KOHA_CONTEXT",
      version: 1,
      context: {
        mode: current650(node) ? "edit" : "new",
        existingTerm: current650(node),
        marcText: marcContext()
      }
    }, AUTHORITY_ORIGIN);
  }

  function openAuthority(node) {
    target650Id = node.id;
    document.getElementById("topic-authority-modal").style.display = "flex";
    document.body.style.overflow = "hidden";
    sendContext();
    window.setTimeout(sendContext, 250);
    window.setTimeout(sendContext, 1000);
  }

  function closeAuthority() {
    const modal = document.getElementById("topic-authority-modal");
    if (modal) modal.style.display = "none";
    document.body.style.overflow = "";
  }

  function addButtons() {
    document.querySelectorAll('.tag[id^="tag_650_"]').forEach(function (node) {
      if (node.querySelector(".topic-authority-launcher")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-sm btn-primary topic-authority-launcher";
      button.innerHTML = '<i class="fa fa-lightbulb" aria-hidden="true"></i> Sugerencia de autoridad';
      button.addEventListener("click", function () { openAuthority(node); });
      const controls = node.querySelector(".field_controls");
      (controls || node.querySelector(".tag_title") || node).appendChild(button);
    });
  }

  function useAuthority(authority) {
    const node = document.getElementById(target650Id);
    if (!node) throw new Error("Ya no se encuentra la etiqueta 650 seleccionada");
    const indicators = node.querySelectorAll("input.indicator");
    if (indicators[0]) indicators[0].value = authority.ind1 || " ";
    if (indicators[1]) indicators[1].value = authority.ind2 || "7";

    const missing = [];
    if (!setFieldValue(node, "650", "a", authority.label)) missing.push("650$a");
    if (authority.uri && !setFieldValue(node, "650", "0", authority.uri)) missing.push("650$0");
    if (authority.sourceCode && !setFieldValue(node, "650", "2", authority.sourceCode)) missing.push("650$2");

    closeAuthority();
    if (missing.length) {
      alert("Se coloco el termino, pero el framework no contiene: " + missing.join(", "));
    }
  }

  function initialize() {
    if (location.pathname !== CATALOGUING_PATH || document.getElementById("topic-authority-modal")) return;
    const style = document.createElement("style");
    style.textContent = [
      ".topic-authority-launcher{margin-left:10px!important;padding:4px 9px!important;font-size:12px!important}",
      "#topic-authority-modal{display:none;position:fixed;inset:0;z-index:2100;background:#0008;align-items:center;justify-content:center;padding:24px}",
      "#topic-authority-dialog{width:min(1200px,96vw);height:92vh;background:#fff;border-radius:8px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px #0007}",
      "#topic-authority-header{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#b94720;color:#fff}",
      "#topic-authority-close{border:0;background:transparent;color:#fff;font-size:28px}",
      "#topic-authority-frame{width:100%;height:100%;border:0}"
    ].join("");
    document.head.appendChild(style);

    const modal = document.createElement("div");
    modal.id = "topic-authority-modal";
    modal.innerHTML = '<div id="topic-authority-dialog" role="dialog" aria-modal="true" aria-label="Sugerencias de autoridad">' +
      '<div id="topic-authority-header"><strong>Sugerencias de autoridad para 650</strong>' +
      '<button id="topic-authority-close" type="button" aria-label="Cerrar">&times;</button></div>' +
      '<iframe id="topic-authority-frame" title="TopicAuthority"></iframe></div>';
    document.body.appendChild(modal);
    authorityFrame = document.getElementById("topic-authority-frame");
    authorityFrame.src = AUTHORITY_URL;
    authorityFrame.addEventListener("load", sendContext);
    document.getElementById("topic-authority-close").addEventListener("click", closeAuthority);
    modal.addEventListener("click", function (event) { if (event.target === modal) closeAuthority(); });

    addButtons();
    new MutationObserver(addButtons).observe(document.getElementById("f") || document.body, { childList: true, subtree: true });
    window.addEventListener("message", function (event) {
      if (event.origin !== AUTHORITY_ORIGIN || event.source !== authorityFrame.contentWindow || !event.data) return;
      if (event.data.type === "TOPIC_AUTHORITY_READY") sendContext();
      if (event.data.type === "TOPIC_AUTHORITY_USE") {
        try { useAuthority(event.data.authority || {}); }
        catch (error) { alert("No se pudo usar la autoridad: " + error.message); }
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
}());
