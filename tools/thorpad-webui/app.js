/* ThorPad Layout Designer — vanilla JS, no build step. */
(function () {
  "use strict";

  // ---- key names allowed by the schema ----
  var KEY_NAMES = [
    "enter", "esc", "space", "tab", "backspace", "delete",
    "up", "down", "left", "right", "home", "end", "pageup", "pagedown",
    "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
    "volup", "voldown", "mute", "playpause", "next", "prev"
  ];
  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  var DIGITS = "0123456789".split("");

  // ---- application state ----
  var state = {
    name: "default",
    trackpadSensitivity: 1.4,
    elements: [],   // {type,x,y,w,h,label?,action?}
    selected: -1    // index into elements
  };

  // ---- DOM refs ----
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("canvas");
  var jsonView = $("jsonView");
  var warningsEl = $("warnings");

  // ============================================================
  // Templates
  // ============================================================
  function tplBlank() {
    return {
      name: "default", trackpadSensitivity: 1.4,
      elements: [{ type: "trackpad", x: 0, y: 0, w: 1, h: 1 }]
    };
  }
  function btn(label, x, y, w, h, action) {
    return { type: "button", x: x, y: y, w: w, h: h, label: label, action: action };
  }
  function tplDefault() {
    return {
      name: "default", trackpadSensitivity: 1.4,
      elements: [
        { type: "trackpad", x: 0.0, y: 0.0, w: 0.78, h: 1.0 },
        btn("A", 0.80, 0.02, 0.18, 0.225, { type: "key", key: "A" }),
        btn("B", 0.80, 0.27, 0.18, 0.225, { type: "key", key: "B" }),
        btn("C", 0.80, 0.52, 0.18, 0.225, { type: "key", key: "C" }),
        btn("D", 0.80, 0.77, 0.18, 0.225, { type: "key", key: "D" })
      ]
    };
  }
  function tplMac() {
    return {
      name: "mac-desktop", trackpadSensitivity: 1.4,
      elements: [
        { type: "trackpad", x: 0.0, y: 0.0, w: 0.70, h: 0.74 },
        btn("L-Click", 0.0, 0.76, 0.345, 0.22, { type: "mouse", button: "left" }),
        btn("R-Click", 0.355, 0.76, 0.345, 0.22, { type: "mouse", button: "right" }),
        btn("Esc", 0.72, 0.02, 0.26, 0.16, { type: "key", key: "esc" }),
        btn("Spotlight", 0.72, 0.20, 0.26, 0.16, { type: "key", key: "space", modifiers: ["meta"] }),
        btn("Copy", 0.72, 0.38, 0.26, 0.16, { type: "key", key: "C", modifiers: ["meta"] }),
        btn("Paste", 0.72, 0.56, 0.26, 0.16, { type: "key", key: "V", modifiers: ["meta"] }),
        btn("Switch App", 0.72, 0.74, 0.26, 0.24, { type: "key", key: "tab", modifiers: ["meta"] })
      ]
    };
  }
  var TEMPLATES = { blank: tplBlank, "default": tplDefault, mac: tplMac };

  // ============================================================
  // Load / normalize a layout object into state
  // ============================================================
  function clamp01(n) { n = Number(n); if (isNaN(n)) n = 0; return Math.max(0, Math.min(1, n)); }

  function loadLayout(obj) {
    state.name = typeof obj.name === "string" ? obj.name : "default";
    state.trackpadSensitivity =
      typeof obj.trackpadSensitivity === "number" ? obj.trackpadSensitivity : 1.4;
    state.elements = [];
    if (Array.isArray(obj.elements)) {
      obj.elements.forEach(function (e) {
        if (!e || (e.type !== "trackpad" && e.type !== "button")) return;
        var el = {
          type: e.type,
          x: clamp01(e.x), y: clamp01(e.y),
          w: clamp01(e.w), h: clamp01(e.h)
        };
        if (el.w <= 0) el.w = 0.1;
        if (el.h <= 0) el.h = 0.1;
        if (e.type === "button") {
          el.label = typeof e.label === "string" ? e.label : "";
          el.action = normalizeAction(e.action);
        }
        state.elements.push(el);
      });
    }
    state.selected = -1;
    $("layoutName").value = state.name;
    $("trackpadSensitivity").value = state.trackpadSensitivity;
    renderAll();
  }

  function normalizeAction(a) {
    if (!a || typeof a !== "object") return { type: "key", key: "A" };
    switch (a.type) {
      case "key":
        var na = { type: "key", key: (typeof a.key === "string" && a.key) ? a.key : "A" };
        if (Array.isArray(a.modifiers) && a.modifiers.length) na.modifiers = a.modifiers.slice();
        return na;
      case "text":
        return { type: "text", text: typeof a.text === "string" ? a.text : "" };
      case "mouse":
        return { type: "mouse", button: ["left", "right", "middle"].indexOf(a.button) >= 0 ? a.button : "left" };
      case "macro":
        var steps = Array.isArray(a.steps) ? a.steps.map(normalizeStep).filter(Boolean) : [];
        return { type: "macro", steps: steps };
      default:
        return { type: "key", key: "A" };
    }
  }
  function normalizeStep(s) {
    if (!s || typeof s !== "object") return null;
    if (s.type === "delay") return { type: "delay", ms: Number(s.ms) || 0 };
    return normalizeAction(s);
  }

  // ============================================================
  // Serialize state -> exact schema object (no extra keys)
  // ============================================================
  function serialize() {
    var out = { name: state.name };
    out.trackpadSensitivity = state.trackpadSensitivity;
    out.elements = state.elements.map(function (e) {
      var o = { type: e.type, x: round(e.x), y: round(e.y), w: round(e.w), h: round(e.h) };
      if (e.type === "button") {
        o.label = e.label || "";
        o.action = serializeAction(e.action);
      }
      return o;
    });
    return out;
  }
  function serializeAction(a) {
    if (!a) return { type: "key", key: "A" };
    if (a.type === "key") {
      var o = { type: "key", key: a.key };
      if (a.modifiers && a.modifiers.length) o.modifiers = a.modifiers.slice();
      return o;
    }
    if (a.type === "text") return { type: "text", text: a.text || "" };
    if (a.type === "mouse") return { type: "mouse", button: a.button || "left" };
    if (a.type === "macro") {
      return {
        type: "macro",
        steps: (a.steps || []).map(function (s) {
          return s.type === "delay" ? { type: "delay", ms: Number(s.ms) || 0 } : serializeAction(s);
        })
      };
    }
    return { type: "key", key: "A" };
  }
  function round(n) { return Math.round(n * 1000) / 1000; }

  // ============================================================
  // Rendering the canvas
  // ============================================================
  function renderAll() {
    renderCanvas();
    renderProps();
    renderJSON();
    renderWarnings();
  }

  function renderCanvas() {
    canvas.innerHTML = "";
    var bad = computeProblemIndices();
    state.elements.forEach(function (e, i) {
      var div = document.createElement("div");
      div.className = "el " + e.type + (i === state.selected ? " selected" : "") + (bad[i] ? " invalid" : "");
      div.style.left = (e.x * 100) + "%";
      div.style.top = (e.y * 100) + "%";
      div.style.width = (e.w * 100) + "%";
      div.style.height = (e.h * 100) + "%";
      var lbl = document.createElement("div");
      lbl.className = "el-label";
      lbl.textContent = e.type === "trackpad" ? "TRACKPAD" : (e.label || "(button)");
      div.appendChild(lbl);

      var handle = document.createElement("div");
      handle.className = "handle";
      div.appendChild(handle);

      div.addEventListener("mousedown", function (ev) { startDrag(ev, i, false); });
      handle.addEventListener("mousedown", function (ev) { ev.stopPropagation(); startDrag(ev, i, true); });

      canvas.appendChild(div);
    });
  }

  // ============================================================
  // Drag / resize
  // ============================================================
  var drag = null;
  function startDrag(ev, index, resize) {
    ev.preventDefault();
    select(index);
    var rect = canvas.getBoundingClientRect();
    var el = state.elements[index];
    drag = {
      index: index, resize: resize, rect: rect,
      startX: ev.clientX, startY: ev.clientY,
      ox: el.x, oy: el.y, ow: el.w, oh: el.h
    };
    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", endDrag);
  }
  function onDrag(ev) {
    if (!drag) return;
    var dx = (ev.clientX - drag.startX) / drag.rect.width;
    var dy = (ev.clientY - drag.startY) / drag.rect.height;
    var el = state.elements[drag.index];
    if (drag.resize) {
      el.w = clamp01(drag.ow + dx);
      el.h = clamp01(drag.oh + dy);
      if (el.w < 0.03) el.w = 0.03;
      if (el.h < 0.03) el.h = 0.03;
      if (el.x + el.w > 1) el.w = 1 - el.x;
      if (el.y + el.h > 1) el.h = 1 - el.y;
      el.w = maybeSnap(el.w);
      el.h = maybeSnap(el.h);
    } else {
      el.x = clamp01(drag.ox + dx);
      el.y = clamp01(drag.oy + dy);
      if (el.x + el.w > 1) el.x = 1 - el.w;
      if (el.y + el.h > 1) el.y = 1 - el.h;
      el.x = maybeSnap(el.x);
      el.y = maybeSnap(el.y);
    }
    renderCanvas();
    syncPropInputs();
    renderJSON();
    renderWarnings();
  }
  function endDrag() {
    drag = null;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", endDrag);
  }
  function maybeSnap(v) {
    if (!$("snapToggle").checked) return v;
    var step = 0.025;
    return Math.max(0, Math.min(1, Math.round(v / step) * step));
  }

  // ============================================================
  // Selection + properties panel
  // ============================================================
  function select(i) {
    state.selected = i;
    renderCanvas();
    renderProps();
  }

  function renderProps() {
    var empty = $("propsEmpty"), body = $("propsBody");
    if (state.selected < 0 || !state.elements[state.selected]) {
      empty.hidden = false; body.hidden = true; return;
    }
    empty.hidden = true; body.hidden = false;
    var e = state.elements[state.selected];
    $("propType").textContent = e.type;
    $("buttonProps").hidden = e.type !== "button";
    syncPropInputs();
    if (e.type === "button") {
      $("propLabel").value = e.label || "";
      renderActionEditor(e.action);
    }
  }

  function syncPropInputs() {
    var e = state.elements[state.selected];
    if (!e) return;
    $("propX").value = round(e.x);
    $("propY").value = round(e.y);
    $("propW").value = round(e.w);
    $("propH").value = round(e.h);
  }

  // ---- action editor ----
  function buildKeyOptions() {
    var sel = $("keySelect");
    sel.innerHTML = "";
    function group(label, items) {
      var og = document.createElement("optgroup");
      og.label = label;
      items.forEach(function (k) {
        var o = document.createElement("option");
        o.value = k; o.textContent = k;
        og.appendChild(o);
      });
      sel.appendChild(og);
    }
    group("Letters", LETTERS);
    group("Digits", DIGITS);
    group("Named keys", KEY_NAMES);
  }

  function renderActionEditor(action) {
    action = action || { type: "key", key: "A" };
    $("actionType").value = action.type;
    showPane(action.type);
    if (action.type === "key") {
      $("keySelect").value = action.key;
      var mods = action.modifiers || [];
      document.querySelectorAll("#pane-key .mod").forEach(function (cb) {
        cb.checked = mods.indexOf(cb.value) >= 0;
      });
    } else if (action.type === "text") {
      $("actionText").value = action.text || "";
    } else if (action.type === "mouse") {
      $("mouseButton").value = action.button || "left";
    } else if (action.type === "macro") {
      renderMacroSteps(action.steps || []);
    }
  }
  function showPane(type) {
    ["key", "text", "mouse", "macro"].forEach(function (t) {
      $("pane-" + t).hidden = (t !== type);
    });
  }

  // Read the action editor controls back into an action object
  function readActionFromEditor() {
    var type = $("actionType").value;
    if (type === "key") {
      var mods = [];
      document.querySelectorAll("#pane-key .mod").forEach(function (cb) {
        if (cb.checked) mods.push(cb.value);
      });
      var a = { type: "key", key: $("keySelect").value };
      if (mods.length) a.modifiers = mods;
      return a;
    }
    if (type === "text") return { type: "text", text: $("actionText").value };
    if (type === "mouse") return { type: "mouse", button: $("mouseButton").value };
    if (type === "macro") {
      // macro steps are kept directly on the element; read from DOM-backed store
      var e = state.elements[state.selected];
      var existing = (e.action && e.action.type === "macro") ? e.action.steps : [];
      return { type: "macro", steps: existing };
    }
    return { type: "key", key: "A" };
  }

  function commitAction() {
    var e = state.elements[state.selected];
    if (!e || e.type !== "button") return;
    e.action = readActionFromEditor();
    renderJSON();
  }

  // ---- macro mini-editor ----
  function renderMacroSteps(steps) {
    var wrap = $("macroSteps");
    wrap.innerHTML = "";
    steps.forEach(function (step, idx) {
      wrap.appendChild(buildMacroStepNode(step, idx, steps));
    });
  }

  function buildMacroStepNode(step, idx, steps) {
    var box = document.createElement("div");
    box.className = "macro-step";

    var row = document.createElement("div");
    row.className = "row";
    var kind = document.createElement("span");
    kind.className = "stepkind";
    kind.textContent = (idx + 1) + ". " + step.type;
    row.appendChild(kind);

    var controls = document.createElement("div");
    controls.className = "reorder";
    var up = document.createElement("button"); up.type = "button"; up.textContent = "↑";
    var down = document.createElement("button"); down.type = "button"; down.textContent = "↓";
    var rm = document.createElement("button"); rm.type = "button"; rm.className = "x"; rm.textContent = "×";
    up.onclick = function () { if (idx > 0) { swap(steps, idx, idx - 1); afterMacroEdit(steps); } };
    down.onclick = function () { if (idx < steps.length - 1) { swap(steps, idx, idx + 1); afterMacroEdit(steps); } };
    rm.onclick = function () { steps.splice(idx, 1); afterMacroEdit(steps); };
    controls.appendChild(up); controls.appendChild(down); controls.appendChild(rm);
    row.appendChild(controls);
    box.appendChild(row);

    if (step.type === "delay") {
      var dl = document.createElement("label");
      dl.textContent = "ms";
      var di = document.createElement("input");
      di.type = "number"; di.min = "0"; di.value = step.ms || 0;
      di.oninput = function () { step.ms = Number(di.value) || 0; commitMacro(steps); };
      dl.appendChild(di); box.appendChild(dl);
    } else if (step.type === "key") {
      var ks = document.createElement("select");
      [].concat(LETTERS, DIGITS, KEY_NAMES).forEach(function (k) {
        var o = document.createElement("option"); o.value = k; o.textContent = k; ks.appendChild(o);
      });
      ks.value = step.key || "A";
      ks.onchange = function () { step.key = ks.value; commitMacro(steps); };
      box.appendChild(ks);
      var mods = document.createElement("div");
      mods.className = "mods";
      ["shift", "ctrl", "alt", "meta"].forEach(function (m) {
        var l = document.createElement("label"); l.className = "chk";
        var cb = document.createElement("input"); cb.type = "checkbox"; cb.value = m;
        cb.checked = (step.modifiers || []).indexOf(m) >= 0;
        cb.onchange = function () {
          var cur = step.modifiers || [];
          if (cb.checked) { if (cur.indexOf(m) < 0) cur.push(m); }
          else { cur = cur.filter(function (x) { return x !== m; }); }
          if (cur.length) step.modifiers = cur; else delete step.modifiers;
          commitMacro(steps);
        };
        l.appendChild(cb); l.appendChild(document.createTextNode(" " + m));
        mods.appendChild(l);
      });
      box.appendChild(mods);
    } else if (step.type === "text") {
      var ti = document.createElement("input");
      ti.type = "text"; ti.value = step.text || ""; ti.placeholder = "text";
      ti.oninput = function () { step.text = ti.value; commitMacro(steps); };
      box.appendChild(ti);
    } else if (step.type === "mouse") {
      var ms = document.createElement("select");
      ["left", "right", "middle"].forEach(function (b) {
        var o = document.createElement("option"); o.value = b; o.textContent = b; ms.appendChild(o);
      });
      ms.value = step.button || "left";
      ms.onchange = function () { step.button = ms.value; commitMacro(steps); };
      box.appendChild(ms);
    }
    return box;
  }

  function swap(arr, a, b) { var t = arr[a]; arr[a] = arr[b]; arr[b] = t; }
  function afterMacroEdit(steps) { commitMacro(steps); renderMacroSteps(steps); }
  function commitMacro(steps) {
    var e = state.elements[state.selected];
    if (e && e.type === "button") { e.action = { type: "macro", steps: steps }; renderJSON(); }
  }

  function newStep(type) {
    switch (type) {
      case "delay": return { type: "delay", ms: 100 };
      case "text": return { type: "text", text: "" };
      case "mouse": return { type: "mouse", button: "left" };
      default: return { type: "key", key: "A" };
    }
  }

  // ============================================================
  // JSON preview
  // ============================================================
  function renderJSON() {
    jsonView.value = JSON.stringify(serialize(), null, 2);
  }

  // ============================================================
  // Validation
  // ============================================================
  function computeProblemIndices() {
    var bad = {};
    state.elements.forEach(function (e, i) {
      if (e.x < 0 || e.y < 0 || e.x + e.w > 1.0001 || e.y + e.h > 1.0001) bad[i] = true;
    });
    // overlaps
    for (var i = 0; i < state.elements.length; i++) {
      for (var j = i + 1; j < state.elements.length; j++) {
        if (overlap(state.elements[i], state.elements[j])) { bad[i] = true; bad[j] = true; }
      }
    }
    return bad;
  }
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function renderWarnings() {
    var msgs = [];
    state.elements.forEach(function (e, i) {
      if (e.x < 0 || e.y < 0 || e.x + e.w > 1.0001 || e.y + e.h > 1.0001) {
        msgs.push("Element #" + (i + 1) + " (" + label(e) + ") is out of bounds (extends past 0..1).");
      }
    });
    for (var i = 0; i < state.elements.length; i++) {
      for (var j = i + 1; j < state.elements.length; j++) {
        if (overlap(state.elements[i], state.elements[j])) {
          msgs.push("Elements #" + (i + 1) + " (" + label(state.elements[i]) + ") and #" +
            (j + 1) + " (" + label(state.elements[j]) + ") overlap.");
        }
      }
    }
    warningsEl.innerHTML = "";
    msgs.forEach(function (m) {
      var d = document.createElement("div");
      d.className = "warn-item"; d.textContent = "⚠ " + m;
      warningsEl.appendChild(d);
    });
  }
  function label(e) { return e.type === "trackpad" ? "trackpad" : (e.label || "button"); }

  // ============================================================
  // Add / delete
  // ============================================================
  function addTrackpad() {
    state.elements.push({ type: "trackpad", x: 0.05, y: 0.05, w: 0.4, h: 0.4 });
    select(state.elements.length - 1);
    renderAll();
  }
  function addButton() {
    state.elements.push({
      type: "button", x: 0.4, y: 0.4, w: 0.18, h: 0.2,
      label: "New", action: { type: "key", key: "A" }
    });
    select(state.elements.length - 1);
    renderAll();
  }
  function deleteSelected() {
    if (state.selected < 0) return;
    state.elements.splice(state.selected, 1);
    state.selected = -1;
    renderAll();
  }

  // ============================================================
  // Export / Import
  // ============================================================
  function exportJSON() {
    var data = JSON.stringify(serialize(), null, 2);
    var blob = new Blob([data], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var safe = (state.name || "layout").replace(/[^a-z0-9_\-]/gi, "_");
    a.href = url; a.download = safe + ".json";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function openImport() { $("importModal").hidden = false; $("importErr").textContent = ""; $("importText").value = ""; }
  function closeImport() { $("importModal").hidden = true; }
  function doImport() {
    var txt = $("importText").value.trim();
    if (!txt) { $("importErr").textContent = "Nothing to import — paste JSON or choose a file."; return; }
    var obj;
    try { obj = JSON.parse(txt); }
    catch (err) { $("importErr").textContent = "Invalid JSON: " + err.message; return; }
    if (typeof obj !== "object" || obj === null) { $("importErr").textContent = "JSON must be an object."; return; }
    if (!Array.isArray(obj.elements)) { $("importErr").textContent = 'JSON missing an "elements" array.'; return; }
    loadLayout(obj);
    closeImport();
  }

  // ============================================================
  // Wire up events
  // ============================================================
  function init() {
    buildKeyOptions();

    $("addTrackpadBtn").onclick = addTrackpad;
    $("addButtonBtn").onclick = addButton;
    $("deleteBtn").onclick = deleteSelected;
    $("exportBtn").onclick = exportJSON;

    $("importBtn").onclick = openImport;
    $("importCancel").onclick = closeImport;
    $("importConfirm").onclick = doImport;
    $("importFile").onchange = function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { $("importText").value = r.result; };
      r.readAsText(f);
    };
    $("importModal").addEventListener("click", function (ev) {
      if (ev.target === $("importModal")) closeImport();
    });

    // top-level fields
    $("layoutName").oninput = function () { state.name = $("layoutName").value; renderJSON(); };
    $("trackpadSensitivity").oninput = function () {
      var v = parseFloat($("trackpadSensitivity").value);
      state.trackpadSensitivity = isNaN(v) ? 1.4 : v;
      renderJSON();
    };

    // numeric x/y/w/h
    ["X", "Y", "W", "H"].forEach(function (k) {
      $("prop" + k).oninput = function () {
        var e = state.elements[state.selected]; if (!e) return;
        var v = clamp01($("prop" + k).value);
        e[k.toLowerCase()] = v;
        if (e.x + e.w > 1) { if (k === "W") e.w = 1 - e.x; else if (k === "X") e.x = 1 - e.w; }
        if (e.y + e.h > 1) { if (k === "H") e.h = 1 - e.y; else if (k === "Y") e.y = 1 - e.h; }
        renderCanvas(); renderJSON(); renderWarnings();
      };
    });

    $("propLabel").oninput = function () {
      var e = state.elements[state.selected]; if (!e) return;
      e.label = $("propLabel").value;
      renderCanvas(); renderJSON();
    };

    // action editor
    $("actionType").onchange = function () {
      var type = $("actionType").value;
      showPane(type);
      var e = state.elements[state.selected];
      if (!e) return;
      // build a fresh default action of the chosen type, preserving macro steps if any
      if (type === "macro") {
        e.action = { type: "macro", steps: (e.action && e.action.type === "macro") ? e.action.steps : [] };
        renderMacroSteps(e.action.steps);
      } else {
        e.action = newStep(type);
        renderActionEditor(e.action);
      }
      renderJSON();
    };
    $("keySelect").onchange = commitAction;
    document.querySelectorAll("#pane-key .mod").forEach(function (cb) { cb.onchange = commitAction; });
    $("actionText").oninput = commitAction;
    $("mouseButton").onchange = commitAction;

    $("macroAddBtn").onclick = function () {
      var e = state.elements[state.selected];
      if (!e || e.type !== "button") return;
      if (!e.action || e.action.type !== "macro") e.action = { type: "macro", steps: [] };
      e.action.steps.push(newStep($("macroAddType").value));
      renderMacroSteps(e.action.steps);
      renderJSON();
    };

    // templates menu
    var tmenu = $("templatesMenu");
    $("templatesBtn").onclick = function (ev) { ev.stopPropagation(); tmenu.classList.toggle("open"); };
    document.addEventListener("click", function () { tmenu.classList.remove("open"); });
    tmenu.querySelectorAll("li").forEach(function (li) {
      li.onclick = function () {
        var t = li.getAttribute("data-template");
        if (TEMPLATES[t]) loadLayout(TEMPLATES[t]());
        tmenu.classList.remove("open");
      };
    });

    // keyboard: Delete removes selected (when not typing in a field)
    document.addEventListener("keydown", function (ev) {
      if ((ev.key === "Delete" || ev.key === "Backspace") &&
          state.selected >= 0 &&
          ["INPUT", "TEXTAREA", "SELECT"].indexOf(document.activeElement.tagName) < 0) {
        ev.preventDefault();
        deleteSelected();
      }
    });

    // deselect when clicking empty canvas
    canvas.addEventListener("mousedown", function (ev) {
      if (ev.target === canvas) { select(-1); }
    });

    // Start on a blank layout (trackpad only) so the editor is usable immediately;
    // Import / Templates are available from the toolbar.
    loadLayout(tplBlank());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
