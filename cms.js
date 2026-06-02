/**
 * Portfolio Case Study CMS — true WYSIWYG.
 * The canvas IS the rendered case-study page. Text is edited in place via
 * contenteditable; images have hover-overlay upload buttons; "+ "inserters
 * appear between blocks; a slash menu converts the current block type.
 * Export writes HTML + images/ folder via File System Access API (ZIP fallback).
 */
(function () {
  "use strict";

  // ============================================================
  // 1. DEFAULT STATE
  // ============================================================
  const defaultState = {
    meta: {
      client: "Mail Studio",
      role: "Lead Product Designer",
      deliverables: "Web App & System",
      timeline: "4 Months (2026)"
    },
    hero: {
      title: "Designing a modern workflow for Outlook email production",
      subtext: "Mail Studio is an internal workflow tool built to simplify the creation and delivery of Outlook-compatible email templates and reusable email assets.",
      image: "project-mail-studio-wide.png"
    },
    blocks: [
      { id: "block-1", type: "heading", text: "The Challenge", fullWidth: false },
      {
        id: "block-2", type: "paragraphs",
        body: "<p>Outlook email production has historically been a tedious, manual, and fragile process for marketing operations. Code written for web browsers frequently breaks in traditional Outlook rendering engines, forcing engineers to rely on tables, inline styling hacks, and constant testing loops.</p><p>Our task was to build a modern, node-based workspace where email assets and templates can be designed collaboratively, compiled instantly into bulletproof tables, and dispatched without rendering errors.</p>",
        fullWidth: false,
        hasSidebar: true,
        sidebarHeading: "Key Objectives",
        sidebarBody: "Reduce template building time by 80%, ensure 100% responsive rendering accuracy on all Outlook clients, and enable asset sharing among designers and content writers."
      },
      { id: "block-3", type: "image-duo", leftAsset: "mail-studio-editor.png", rightAsset: "mail-studio-preview.png" },
      {
        id: "block-4", type: "quote",
        text: "We didn't just build an email builder. We built an integrated compiler that parses visual layouts into semantic, layout-stable code blocks.",
        author: "Alen Thomas — Case Architect"
      },
      { id: "block-5", type: "heading", text: "The Visual Solution", fullWidth: false },
      {
        id: "block-6", type: "paragraphs",
        body: "<p>We designed a flexible workspace based on atomic modules. Designers build templates using drag-and-drop structural components (blocks, dynamic fields, and buttons) that are visual abstractions of HTML components.</p>",
        fullWidth: false, hasSidebar: false, sidebarHeading: "", sidebarBody: ""
      },
      {
        id: "block-7", type: "overlap",
        bgAsset: "mail-studio-collaboration.png",
        cardHeading: "Systems Impact",
        cardBody: "Upon rolling out Mail Studio internally, email production times plummeted from three days to under forty minutes per template."
      }
    ]
  };

  let state = JSON.parse(JSON.stringify(defaultState));
  const images = {};         // assetName -> File/Blob
  const blobUrlCache = {};   // assetName -> blob: URL

  // ============================================================
  // 2. DOM REFS
  // ============================================================
  const canvas = document.getElementById("cms-canvas-root");
  const formatToolbar = document.getElementById("format-toolbar");
  const slashMenu = document.getElementById("slash-menu");
  const insertMenu = document.getElementById("insert-menu");
  const importFileInput = document.getElementById("import-file");
  const imageFileInput = document.getElementById("image-file-input");

  const metaInputs = {
    client: document.getElementById("meta-client"),
    role: document.getElementById("meta-role"),
    deliverables: document.getElementById("meta-deliverables"),
    timeline: document.getElementById("meta-timeline")
  };

  // ============================================================
  // 3. UTILITIES
  // ============================================================
  function escapeHtml(text) {
    if (text == null) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Allowed class values for <span> in editable content. Anything else is
  // dropped (and a span with no surviving class is unwrapped entirely).
  const SPAN_CLASS_ALLOW = [
    "txt-sm", "txt-lg", "txt-xl",
    "clr-olive", "clr-lime", "clr-muted", "clr-ink"
  ];

  function sanitizeInline(html) {
    if (!html) return "";
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const allowed = ["P", "BR", "B", "STRONG", "I", "EM", "A", "DIV", "UL", "OL", "LI", "U", "S", "STRIKE", "SPAN"];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 1) {
          if (allowed.indexOf(child.tagName) === -1) {
            child.parentNode.replaceChild(document.createTextNode(child.textContent), child);
            return;
          }

          if (child.tagName === "SPAN") {
            const classes = (child.getAttribute("class") || "").split(/\s+/).filter(function (c) {
              return SPAN_CLASS_ALLOW.indexOf(c) !== -1;
            });
            Array.prototype.slice.call(child.attributes).forEach(function (attr) { child.removeAttribute(attr.name); });
            if (!classes.length) {
              // No surviving classes — unwrap the span, keep its children.
              while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child);
              child.parentNode.removeChild(child);
              return;
            }
            child.setAttribute("class", classes.join(" "));
            walk(child);
            return;
          }

          if (child.tagName === "A") {
            const href = child.getAttribute("href");
            Array.prototype.slice.call(child.attributes).forEach(function (attr) { child.removeAttribute(attr.name); });
            if (href) child.setAttribute("href", href);
            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noopener noreferrer");
            walk(child);
            return;
          }

          // Default: strip every attribute.
          Array.prototype.slice.call(child.attributes).forEach(function (attr) { child.removeAttribute(attr.name); });
          walk(child);
        } else if (child.nodeType !== 3) {
          child.parentNode.removeChild(child);
        }
      });
    })(tmp);

    // --- Post-sanitization cleanup pass ---
    // 1. Unwrap any txt-* size spans that ended up wrapping LI content
    //    (applying a size span to a list selection creates invalid structure
    //     and causes visible font-size mismatches).
    tmp.querySelectorAll("ul span[class], ol span[class]").forEach(function (span) {
      if (Array.prototype.some.call(span.classList, function (c) { return c.indexOf("txt-") === 0; })) {
        while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
        span.parentNode.removeChild(span);
      }
    });

    // 2. Remove empty <li> elements.
    tmp.querySelectorAll("li").forEach(function (li) {
      if (!li.textContent.trim() && !li.querySelector("img, br")) li.parentNode.removeChild(li);
    });

    // 3. Remove empty <ul> / <ol> (may result from step 2).
    tmp.querySelectorAll("ul, ol").forEach(function (list) {
      if (!list.querySelector("li")) list.parentNode.removeChild(list);
    });

    // 4. Remove empty <p> elements (only whitespace / &nbsp; content).
    tmp.querySelectorAll("p").forEach(function (p) {
      if (!p.textContent.trim().replace(/\u00a0/g, "")) p.parentNode.removeChild(p);
    });

    return tmp.innerHTML;
  }

  function stripTagsToText(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return tmp.textContent;
  }

  function newId() { return "block-" + Date.now() + "-" + Math.floor(Math.random() * 1000); }
  function makeSlug(s) { return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }

  function makeUploadName(originalName) {
    const dot = originalName.lastIndexOf(".");
    const ext = (dot > -1 ? originalName.slice(dot + 1) : "png").toLowerCase();
    const base = (dot > -1 ? originalName.slice(0, dot) : originalName)
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return (base || "image") + "-" + Date.now() + "." + ext;
  }

  function getBlobUrl(assetName) {
    if (!assetName || !images[assetName]) return null;
    if (!blobUrlCache[assetName]) blobUrlCache[assetName] = URL.createObjectURL(images[assetName]);
    return blobUrlCache[assetName];
  }

  function imageUrlFor(assetName) {
    return getBlobUrl(assetName) || (assetName ? "assets/" + assetName : "");
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(",");
    const mime = (meta.match(/data:([^;]+)/) || [, "application/octet-stream"])[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function el(tag, opts) {
    const e = document.createElement(tag);
    if (!opts) return e;
    if (opts.className) e.className = opts.className;
    if (opts.html != null) e.innerHTML = opts.html;
    if (opts.text != null) e.textContent = opts.text;
    if (opts.attrs) Object.keys(opts.attrs).forEach(function (k) { e.setAttribute(k, opts.attrs[k]); });
    if (opts.style) Object.keys(opts.style).forEach(function (k) { e.style[k] = opts.style[k]; });
    return e;
  }

  // ============================================================
  // 4. RENDER — build the case-study DOM in place
  // ============================================================
  function render() {
    canvas.innerHTML = "";

    // ----- Case hero -----
    const hero = el("section", { className: "case-hero" });

    const metaGrid = el("div", { className: "case-hero__meta" });
    [
      ["Client", "client"],
      ["Role", "role"],
      ["Deliverables", "deliverables"],
      ["Timeline", "timeline"]
    ].forEach(function (pair) {
      const item = el("div", { className: "case-hero__meta-item" });
      item.appendChild(document.createTextNode(pair[0]));
      const strong = el("strong");
      strong.textContent = state.meta[pair[1]];
      strong.dataset.metaField = pair[1];
      item.appendChild(strong);
      metaGrid.appendChild(item);
    });
    hero.appendChild(metaGrid);

    const title = el("h1", { className: "case-title" });
    title.contentEditable = "true";
    title.dataset.placeholder = "Case study title…";
    title.textContent = state.hero.title;
    bindEditable(title, function () {
      state.hero.title = title.textContent;
    });
    hero.appendChild(title);

    const subtext = el("p", { className: "case-subtext" });
    subtext.contentEditable = "true";
    subtext.dataset.placeholder = "Lead paragraph…";
    subtext.innerHTML = state.hero.subtext;
    bindEditable(subtext, function () {
      state.hero.subtext = sanitizeInline(subtext.innerHTML);
    });
    hero.appendChild(subtext);

    const heroImgWrap = el("div", { className: "case-hero-image-wrap" });
    heroImgWrap.appendChild(buildImageElement("case-hero-image", state.hero, "image", "Hero image"));
    hero.appendChild(heroImgWrap);

    canvas.appendChild(hero);

    // ----- Case body / grid -----
    const body = el("section", { className: "case-body" });
    const grid = el("div", { className: "editorial-grid" });

    grid.appendChild(buildInserter(0));
    state.blocks.forEach(function (block, idx) {
      renderBlockInto(grid, block, idx);
      grid.appendChild(buildInserter(idx + 1));
    });

    body.appendChild(grid);
    canvas.appendChild(body);
  }

  function renderBlockInto(grid, block, idx) {
    // Wrapper: a grid item that spans 12 cols (so inner content can use its
    // own col-span). This lets the wrapper own hover affordances cleanly.
    const wrap = el("div", { className: "cms-block col-span-12 cms-block--" + block.type });
    wrap.dataset.id = block.id;
    wrap.dataset.index = idx;
    wrap.appendChild(buildBlockControls(idx));

    if (block.type === "heading") {
      const h = el("h2", {
        className: block.fullWidth ? "col-span-12" : "col-span-8 col-start-3",
        attrs: { contenteditable: "true" }
      });
      h.style.fontSize = "40px";
      h.style.fontWeight = "600";
      h.style.lineHeight = "1.2";
      h.style.color = "var(--olive)";
      h.style.marginTop = "24px";
      h.dataset.placeholder = "Heading…";
      h.textContent = block.text;
      bindEditable(h, function () { block.text = h.textContent; }, { isBlockHead: true });
      wrap.appendChild(h);
      wrap.appendChild(buildPropsRow(block));
    } else if (block.type === "paragraphs") {
      const textCls = block.hasSidebar
        ? "col-span-8 editorial-text"
        : ((block.fullWidth ? "col-span-12" : "col-span-8 col-start-3") + " editorial-text");
      const body = el("div", { className: textCls, attrs: { contenteditable: "true" } });
      body.dataset.placeholder = "Write your story…";
      body.innerHTML = block.body || "";
      bindEditable(body, function () { block.body = sanitizeInline(body.innerHTML); }, { isBlockHead: true });
      wrap.appendChild(body);

      if (block.hasSidebar) {
        const side = el("div", { className: "col-span-4 sidebar-callout" });
        const sh = el("h4", { attrs: { contenteditable: "true" } });
        sh.dataset.placeholder = "Sidebar heading";
        sh.textContent = block.sidebarHeading;
        bindEditable(sh, function () { block.sidebarHeading = sh.textContent; });
        const sb = el("p", { attrs: { contenteditable: "true" } });
        sb.dataset.placeholder = "Sidebar body";
        sb.innerHTML = block.sidebarBody || "";
        bindEditable(sb, function () { block.sidebarBody = sanitizeInline(sb.innerHTML); });
        side.appendChild(sh);
        side.appendChild(sb);
        wrap.appendChild(side);
      }
      wrap.appendChild(buildPropsRow(block));
    } else if (block.type === "single-image") {
      const wrapImg = el("div", { className: "single-image-wrap" });
      wrapImg.appendChild(buildImageElement("single-image", block, "asset", "Single image"));
      wrap.appendChild(wrapImg);
    } else if (block.type === "image-duo") {
      const duo = el("div", { className: "image-duo" });
      duo.appendChild(buildImageElement("image-duo__left", block, "leftAsset", "Left image"));
      duo.appendChild(buildImageElement("image-duo__right", block, "rightAsset", "Right image"));
      wrap.appendChild(duo);
    } else if (block.type === "quote") {
      const qWrap = el("div", { className: "case-quote-wrap" });
      const q = el("blockquote", { className: "case-quote", attrs: { contenteditable: "true" } });
      q.dataset.placeholder = "Write a pull quote…";
      q.textContent = block.text;
      bindEditable(q, function () { block.text = q.textContent; }, { isBlockHead: true });
      const a = el("span", { className: "case-quote-author", attrs: { contenteditable: "true" } });
      a.dataset.placeholder = "Author — Role";
      a.textContent = block.author;
      bindEditable(a, function () { block.author = a.textContent; });
      qWrap.appendChild(q);
      qWrap.appendChild(a);
      wrap.appendChild(qWrap);
    } else if (block.type === "overlap") {
      const overlap = el("div", { className: "overlap-section" });
      overlap.appendChild(buildImageElement("overlap-image", block, "bgAsset", "Background image"));
      const card = el("div", { className: "overlap-card" });
      const ch = el("h3", { attrs: { contenteditable: "true" } });
      ch.dataset.placeholder = "Card heading";
      ch.textContent = block.cardHeading;
      bindEditable(ch, function () { block.cardHeading = ch.textContent; }, { isBlockHead: true });
      const cb = el("p", { attrs: { contenteditable: "true" } });
      cb.dataset.placeholder = "Card body";
      cb.innerHTML = block.cardBody || "";
      bindEditable(cb, function () { block.cardBody = sanitizeInline(cb.innerHTML); });
      card.appendChild(ch);
      card.appendChild(cb);
      overlap.appendChild(card);
      wrap.appendChild(overlap);
    }

    grid.appendChild(wrap);
  }

  function buildBlockControls(idx) {
    const ctrl = el("div", { className: "cms-block-controls" });
    ctrl.innerHTML =
      '<button class="cms-ctrl-btn" data-action="up" title="Move up">↑</button>' +
      '<button class="cms-ctrl-btn" data-action="down" title="Move down">↓</button>' +
      '<button class="cms-ctrl-btn cms-ctrl-btn--danger" data-action="delete" title="Delete">×</button>';
    ctrl.addEventListener("click", function (e) {
      const btn = e.target.closest(".cms-ctrl-btn");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "up" && idx > 0) {
        const t = state.blocks[idx]; state.blocks[idx] = state.blocks[idx - 1]; state.blocks[idx - 1] = t;
        render();
      } else if (action === "down" && idx < state.blocks.length - 1) {
        const t = state.blocks[idx]; state.blocks[idx] = state.blocks[idx + 1]; state.blocks[idx + 1] = t;
        render();
      } else if (action === "delete") {
        if (confirm("Delete this block?")) { state.blocks.splice(idx, 1); render(); }
      }
    });
    return ctrl;
  }

  function buildPropsRow(block) {
    const row = el("div", { className: "cms-props-row" });
    let html = "";
    if (block.type === "heading") {
      html = '<label><input type="checkbox" data-prop="fullWidth"' + (block.fullWidth ? " checked" : "") + ' /> Full-width</label>';
    } else if (block.type === "paragraphs") {
      html =
        '<label><input type="checkbox" data-prop="fullWidth"' + (block.fullWidth ? " checked" : "") + ' /> Full-width</label>' +
        '<label><input type="checkbox" data-prop="hasSidebar"' + (block.hasSidebar ? " checked" : "") + ' /> Sidebar callout</label>';
    } else {
      return el("div");
    }
    row.innerHTML = html;
    row.addEventListener("change", function (e) {
      const cb = e.target.closest("input[type=checkbox]");
      if (!cb) return;
      block[cb.dataset.prop] = cb.checked;
      render();
    });
    return row;
  }

  function buildInserter(insertAtIndex) {
    const ins = el("div", { className: "cms-inserter col-span-12" });
    const btn = el("button", { className: "cms-inserter-btn", attrs: { title: "Insert block" } });
    btn.textContent = "+";
    btn.addEventListener("click", function () { openInsertMenu(btn, insertAtIndex); });
    ins.appendChild(btn);
    return ins;
  }

  // Map our friendly fit/pos values to CSS. Kept as plain functions so
  // compileHtml() can reuse them when emitting the exported markup.
  function fitToBackgroundSize(fit) {
    if (fit === "fit") return "contain";
    if (fit === "fill") return "100% 100%";
    return "cover";
  }
  function posToBackgroundPosition(pos) {
    switch (pos) {
      case "top": return "center top";
      case "bottom": return "center bottom";
      case "left": return "left center";
      case "right": return "right center";
      case "top-left": return "left top";
      case "top-right": return "right top";
      case "bottom-left": return "left bottom";
      case "bottom-right": return "right bottom";
      default: return "center center";
    }
  }

  const POSITIONS = [
    "top-left", "top", "top-right",
    "left", "center", "right",
    "bottom-left", "bottom", "bottom-right"
  ];

  // Build an asset element (background-image style) with hover overlay that
  // exposes Upload / Remove / Fit / Anchor controls. `className` is the
  // existing case-study image class (e.g. "case-hero-image"); we apply that
  // class to the holder directly — an absolutely-positioned image class
  // (.overlap-image) would collapse a separate wrapper to zero size.
  // `parent` is the state object (state.hero, or a block); `slotKey` is the
  // asset field name on it ("image", "asset", "leftAsset", "rightAsset",
  // "bgAsset"). Fit / position siblings are stored as <slotKey>Fit / <slotKey>Pos.
  function buildImageElement(className, parent, slotKey, label) {
    const assetName = parent[slotKey] || "";
    const fit = parent[slotKey + "Fit"] || "crop";
    const pos = parent[slotKey + "Pos"] || "center";

    const holder = el("div", { className: "cms-img-holder " + className });

    const url = imageUrlFor(assetName);
    if (url) {
      holder.style.backgroundImage = "url('" + url + "')";
      holder.style.backgroundSize = fitToBackgroundSize(fit);
      holder.style.backgroundPosition = posToBackgroundPosition(pos);
      holder.classList.add("asset-loaded");
    } else {
      holder.classList.add("cms-img-empty");
    }

    const posGridHtml = POSITIONS.map(function (p) {
      return '<button data-pos="' + p + '"' + (p === pos ? ' class="is-active"' : '') + ' title="' + p + '" aria-label="Anchor ' + p + '"></button>';
    }).join("");

    const overlay = el("div", { className: "cms-img-overlay" });
    overlay.innerHTML =
      '<div class="cms-img-overlay__label">' + escapeHtml(label) + '</div>' +
      '<div class="cms-img-overlay__name">' + (assetName ? escapeHtml(assetName) : "<em>no image</em>") + '</div>' +
      '<div class="cms-img-overlay__btns">' +
        '<button class="cms-btn cms-btn--sm" data-action="upload">Upload image</button>' +
        (assetName && images[assetName] ? '<button class="cms-btn cms-btn--sm" data-action="remove">Remove</button>' : '') +
      '</div>' +
      (assetName ? (
        '<div class="cms-img-opts">' +
          '<label class="cms-img-opt">' +
            '<span>Fit</span>' +
            '<select class="cms-img-fit">' +
              '<option value="crop"'    + (fit === "crop"    ? " selected" : "") + '>Crop (fill)</option>' +
              '<option value="fit"'     + (fit === "fit"     ? " selected" : "") + '>Fit (contain)</option>' +
              '<option value="fill"'    + (fit === "fill"    ? " selected" : "") + '>Stretch</option>' +
            '</select>' +
          '</label>' +
          '<div class="cms-img-opt">' +
            '<span>Anchor</span>' +
            '<div class="cms-img-pos-grid">' + posGridHtml + '</div>' +
          '</div>' +
        '</div>'
      ) : "");

    overlay.addEventListener("click", function (e) {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "upload") {
        pickImageFile(function (file) {
          const name = makeUploadName(file.name);
          images[name] = file;
          parent[slotKey] = name;
          render();
        });
      } else if (btn.dataset.action === "remove") {
        if (assetName && images[assetName]) {
          if (blobUrlCache[assetName]) { URL.revokeObjectURL(blobUrlCache[assetName]); delete blobUrlCache[assetName]; }
          delete images[assetName];
        }
        parent[slotKey] = "";
        render();
      }
    });

    // Fit dropdown — update inline style in place (no full re-render needed).
    const fitSelect = overlay.querySelector(".cms-img-fit");
    if (fitSelect) {
      fitSelect.addEventListener("change", function () {
        parent[slotKey + "Fit"] = fitSelect.value;
        holder.style.backgroundSize = fitToBackgroundSize(fitSelect.value);
      });
    }

    // Anchor grid — toggle active dot and update inline style.
    overlay.querySelectorAll(".cms-img-pos-grid button").forEach(function (b) {
      b.addEventListener("click", function () {
        const newPos = b.dataset.pos;
        parent[slotKey + "Pos"] = newPos;
        holder.style.backgroundPosition = posToBackgroundPosition(newPos);
        overlay.querySelectorAll(".cms-img-pos-grid button").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
      });
    });

    holder.appendChild(overlay);
    return holder;
  }

  function pickImageFile(callback) {
    imageFileInput.value = "";
    const handler = function () {
      const file = imageFileInput.files && imageFileInput.files[0];
      imageFileInput.removeEventListener("change", handler);
      if (file) callback(file);
    };
    imageFileInput.addEventListener("change", handler);
    imageFileInput.click();
  }

  // ============================================================
  // 5. EDITABLE BINDINGS
  // ============================================================
  // opts.isBlockHead = true on the "primary" editable of a block, so / triggers
  // the slash menu only there (not on sidebar/author/card-body sub-fields).
  function bindEditable(node, onChange, opts) {
    opts = opts || {};
    node.classList.add("cms-editable");
    node.addEventListener("input", function () {
      onChange();
      if (opts.isBlockHead) maybeOpenSlashMenu(node);
    });
    node.addEventListener("blur", function () { hideSlashMenu(); });
    node.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { hideSlashMenu(); hideInsertMenu(); }
    });
  }

  // ============================================================
  // 6. META INPUT SYNC
  // ============================================================
  function syncMetaToForm() {
    metaInputs.client.value = state.meta.client;
    metaInputs.role.value = state.meta.role;
    metaInputs.deliverables.value = state.meta.deliverables;
    metaInputs.timeline.value = state.meta.timeline;
  }
  Object.keys(metaInputs).forEach(function (key) {
    metaInputs[key].addEventListener("input", function () {
      state.meta[key] = metaInputs[key].value;
      // Live update the in-canvas meta tile without full re-render.
      const tile = canvas.querySelector('strong[data-meta-field="' + key + '"]');
      if (tile) tile.textContent = metaInputs[key].value;
    });
  });

  // ============================================================
  // 7. INSERT MENU
  // ============================================================
  function openInsertMenu(anchor, insertAtIndex) {
    insertMenu.hidden = false;
    const r = anchor.getBoundingClientRect();
    insertMenu.style.top = (r.bottom + 6) + "px";
    insertMenu.style.left = r.left + "px";
    insertMenu.dataset.insertAt = insertAtIndex;
    setTimeout(function () { document.addEventListener("click", outsideInsertClose, { once: true }); }, 0);
  }

  function outsideInsertClose(e) {
    if (!insertMenu.contains(e.target)) hideInsertMenu();
  }

  function hideInsertMenu() { insertMenu.hidden = true; }

  insertMenu.addEventListener("mousedown", function (e) { e.preventDefault(); });
  insertMenu.addEventListener("click", function (e) {
    const li = e.target.closest("li[data-type]");
    if (!li) return;
    const insertAt = parseInt(insertMenu.dataset.insertAt, 10);
    if (isNaN(insertAt)) return;
    state.blocks.splice(insertAt, 0, createBlock(li.dataset.type));
    hideInsertMenu();
    render();
  });

  // ============================================================
  // 8. SLASH MENU
  // ============================================================
  let slashActiveEl = null;
  function maybeOpenSlashMenu(node) {
    const text = (node.textContent || "").trim();
    if (text === "/") openSlashMenu(node);
    else if (slashActiveEl) hideSlashMenu();
  }

  function openSlashMenu(node) {
    slashActiveEl = node;
    const r = node.getBoundingClientRect();
    slashMenu.hidden = false;
    slashMenu.style.top = (r.bottom + 6) + "px";
    slashMenu.style.left = r.left + "px";
  }

  function hideSlashMenu() { slashMenu.hidden = true; slashActiveEl = null; }

  slashMenu.addEventListener("mousedown", function (e) { e.preventDefault(); });
  slashMenu.addEventListener("click", function (e) {
    const li = e.target.closest("li[data-type]");
    if (!li || !slashActiveEl) return;
    const wrap = slashActiveEl.closest(".cms-block");
    if (!wrap) { hideSlashMenu(); return; }
    const idx = state.blocks.findIndex(function (b) { return b.id === wrap.dataset.id; });
    if (idx > -1) state.blocks[idx] = createBlock(li.dataset.type, state.blocks[idx].id);
    hideSlashMenu();
    render();
  });

  function createBlock(type, reuseId) {
    const b = { id: reuseId || newId(), type: type };
    if (type === "heading") { b.text = "New heading"; b.fullWidth = false; }
    else if (type === "paragraphs") { b.body = "<p>Start writing…</p>"; b.fullWidth = false; b.hasSidebar = false; b.sidebarHeading = ""; b.sidebarBody = ""; }
    else if (type === "single-image") { b.asset = ""; }
    else if (type === "image-duo") { b.leftAsset = ""; b.rightAsset = ""; }
    else if (type === "quote") { b.text = "A standout statement."; b.author = "— Author"; }
    else if (type === "overlap") { b.bgAsset = ""; b.cardHeading = "Impact"; b.cardBody = "Outcomes and metrics."; }
    return b;
  }

  // ============================================================
  // 9. FORMAT TOOLBAR — Bold / Italic / Link on selection
  // ============================================================
  document.addEventListener("selectionchange", function () {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { formatToolbar.hidden = true; return; }
    const anchorEl = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
    if (!anchorEl || !anchorEl.closest(".cms-editable")) { formatToolbar.hidden = true; return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    formatToolbar.hidden = false;
    formatToolbar.style.top = (rect.top - formatToolbar.offsetHeight - 8) + "px";
    formatToolbar.style.left = (rect.left + rect.width / 2 - formatToolbar.offsetWidth / 2) + "px";

    // Disable the size picker when the selection is inside a list.
    // Applying a txt-* size span to list items wraps li elements inside a span
    // (invalid HTML) and creates font-size inconsistencies in the exported page.
    const inList = !!(anchorEl.closest("ul, ol, li"));
    const sizePicker = formatToolbar.querySelector("select[data-rich='size']");
    if (sizePicker) {
      sizePicker.disabled = inList;
      sizePicker.title = inList
        ? "Font size cannot be changed on list items — lists inherit the correct body size automatically."
        : "Font size";
      sizePicker.style.opacity = inList ? "0.35" : "";
      sizePicker.style.cursor = inList ? "not-allowed" : "";
    }
  });

  formatToolbar.addEventListener("mousedown", function (e) {
    // Preserve the selection only for buttons; native <select> needs a real
    // mousedown to open its dropdown.
    if (e.target.closest("button")) e.preventDefault();
  });
  formatToolbar.addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-cmd]");
    if (!btn) return;
    const cmd = btn.dataset.cmd;
    if (cmd === "createLink") {
      const sel = window.getSelection();
      const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      const url = prompt("Link URL:");
      if (url && range) {
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("createLink", false, url);
      }
    } else {
      document.execCommand(cmd, false, null);
    }
    syncEditableAfterFormat();
  });

  formatToolbar.addEventListener("change", function (e) {
    const select = e.target.closest("select[data-rich]");
    if (!select) return;
    const opt = select.selectedOptions[0];
    if (opt) {
      if (opt.dataset.clear) unwrapClassPrefix(opt.dataset.clear);
      else if (opt.value) wrapSelectionInClass(opt.value);
    }
    select.selectedIndex = 0; // back to "Size" / "Color" placeholder
    syncEditableAfterFormat();
  });

  function syncEditableAfterFormat() {
    const node = window.getSelection() && window.getSelection().anchorNode;
    const ed = node && (node.nodeType === 1 ? node : node.parentElement).closest(".cms-editable");
    if (ed) ed.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function currentEditableFromSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    return node && node.closest(".cms-editable");
  }

  // Wrap the current selection in <span class="className">. surroundContents
  // throws when the range straddles element boundaries, so we fall back to
  // extract → wrap → reinsert which always works.
  function wrapSelectionInClass(className) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    if (!currentEditableFromSelection()) return;

    const span = document.createElement("span");
    span.className = className;
    try {
      range.surroundContents(span);
    } catch (err) {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(span);
    sel.addRange(newRange);
  }

  // Strip any span class whose name starts with `prefix` (e.g. "txt-", "clr-")
  // from spans intersecting the current selection. If a span ends up with no
  // classes, unwrap it entirely.
  function unwrapClassPrefix(prefix) {
    const ed = currentEditableFromSelection();
    if (!ed) return;
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    Array.prototype.slice.call(ed.querySelectorAll("span")).forEach(function (span) {
      if (!range.intersectsNode(span)) return;
      const remaining = Array.prototype.filter.call(span.classList, function (c) {
        return c.indexOf(prefix) !== 0;
      });
      if (remaining.length) {
        span.className = remaining.join(" ");
      } else {
        while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
        span.parentNode.removeChild(span);
      }
    });
  }

  // ============================================================
  // 10. COMPILE HTML (export-time only)
  // ============================================================
  function compileHtml() {
    const meta = state.meta;
    const hero = state.hero;

    // Emit the full attribute string (class + style + data-asset + aria-label).
    // The caller no longer pre-writes a class attribute, so there's no
    // duplicate-attr issue, and fit/position styles always go through.
    function imageAttrs(parent, slotKey, baseClass, ariaLabel) {
      const assetName = parent[slotKey] || "";
      const fit = parent[slotKey + "Fit"] || "crop";
      const pos = parent[slotKey + "Pos"] || "center";
      const styleStr = "background-size:" + fitToBackgroundSize(fit) +
        ";background-position:" + posToBackgroundPosition(pos) + ";background-repeat:no-repeat;";
      if (assetName && images[assetName]) {
        return 'class="' + baseClass + ' asset-loaded" style="' + styleStr +
          "background-image:url('images/" + assetName + "')\" aria-label=\"" +
          escapeHtml(ariaLabel) + '"';
      }
      return 'class="' + baseClass + '" data-asset="' + escapeHtml(assetName) +
        '" style="' + styleStr + '" aria-label="' + escapeHtml(ariaLabel) + '"';
    }

    const metaHtml =
      '<div class="case-hero__meta-item">Client<strong>' + escapeHtml(meta.client) + '</strong></div>' +
      '<div class="case-hero__meta-item">Role<strong>' + escapeHtml(meta.role) + '</strong></div>' +
      '<div class="case-hero__meta-item">Deliverables<strong>' + escapeHtml(meta.deliverables) + '</strong></div>' +
      '<div class="case-hero__meta-item">Timeline<strong>' + escapeHtml(meta.timeline) + '</strong></div>';

    let blocksHtml = "";
    state.blocks.forEach(function (block) {
      if (block.type === "heading") {
        const cls = block.fullWidth ? "col-span-12" : "col-span-8 col-start-3";
        blocksHtml += '<h2 class="' + cls + ' reveal" style="font-size:40px;font-weight:600;line-height:1.2;color:var(--olive);margin-top:24px;">' + escapeHtml(block.text) + '</h2>\n';
      } else if (block.type === "paragraphs") {
        const body = block.body || "";
        if (block.hasSidebar && (block.sidebarHeading || block.sidebarBody)) {
          blocksHtml +=
            '<div class="col-span-8 editorial-text reveal">\n' + body + '\n</div>\n' +
            '<div class="col-span-4 sidebar-callout reveal">\n<h4>' + escapeHtml(block.sidebarHeading) + '</h4>\n' + (block.sidebarBody || "") + '\n</div>\n';
        } else {
          const cls = block.fullWidth ? "col-span-12" : "col-span-8 col-start-3";
          blocksHtml += '<div class="' + cls + ' editorial-text reveal">\n' + body + '\n</div>\n';
        }
      } else if (block.type === "single-image") {
        blocksHtml += '<div class="single-image-wrap reveal">\n<div ' + imageAttrs(block, "asset", "single-image", "Visual design case asset") + '></div>\n</div>\n';
      } else if (block.type === "image-duo") {
        blocksHtml +=
          '<div class="image-duo reveal">\n' +
          '<div ' + imageAttrs(block, "leftAsset", "image-duo__left", "Project layout asset left") + '></div>\n' +
          '<div ' + imageAttrs(block, "rightAsset", "image-duo__right", "Project layout asset right") + '></div>\n' +
          '</div>\n';
      } else if (block.type === "quote") {
        blocksHtml +=
          '<div class="case-quote-wrap reveal">\n' +
          '<blockquote class="case-quote">&ldquo;' + escapeHtml(block.text) + '&rdquo;</blockquote>\n' +
          '<span class="case-quote-author">' + escapeHtml(block.author) + '</span>\n' +
          '</div>\n';
      } else if (block.type === "overlap") {
        blocksHtml +=
          '<div class="overlap-section reveal">\n' +
          '<div ' + imageAttrs(block, "bgAsset", "overlap-image", "Project workflow overlap visual") + '></div>\n' +
          '<div class="overlap-card">\n<h3>' + escapeHtml(block.cardHeading) + '</h3>\n' + (block.cardBody || "") + '\n</div>\n' +
          '</div>\n';
      }
    });

    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
      '<meta charset="UTF-8" />\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
      '<title>' + escapeHtml(meta.client) + ' - Case Study - Alen Thomas</title>\n' +
      '<meta name="description" content="' + escapeHtml(stripTagsToText(hero.subtext)) + '" />\n' +
      '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n' +
      '<link href="https://fonts.googleapis.com/css2?family=Darker+Grotesque:wght@400;500;600;700&family=IBM+Plex+Serif:ital,wght@1,400&display=swap" rel="stylesheet" />\n' +
      '<link rel="stylesheet" href="styles.css" />\n' +
      '</head>\n<body>\n' +
      '<div id="starfield-bg" aria-hidden="true"></div>\n' +
      '<svg id="mouse-trail" aria-hidden="true"></svg>\n' +
      '<div class="hero-banner"></div>\n' +
      '<header class="nav" id="top">\n' +
        '<a href="index.html#top" class="nav-back">&larr; Back to Home</a>\n' +
        '<nav class="nav__links" aria-label="Primary">\n' +
          '<a href="index.html#work">Work</a>\n' +
          '<a href="index.html#labs">Thinking/ lab</a>\n' +
          '<a href="index.html#about">A little more about me</a>\n' +
          '<a href="index.html#contact">Contact</a>\n' +
          '<a href="Alen Thomas Resume APR 26.pdf" target="_blank">Resume</a>\n' +
        '</nav>\n' +
        '<button class="nav__toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button>\n' +
      '</header>\n' +
      '<main>\n' +
        '<section class="case-hero">\n' +
          '<div class="case-hero__meta">' + metaHtml + '</div>\n' +
          '<h1 class="case-title reveal">' + escapeHtml(stripTagsToText(hero.title)) + '</h1>\n' +
          '<p class="case-subtext reveal">' + (hero.subtext || "") + '</p>\n' +
          '<div class="case-hero-image-wrap reveal"><div ' + imageAttrs(hero, "image", "case-hero-image", "Visual workspace hero header image") + '></div></div>\n' +
        '</section>\n' +
        '<section class="case-body"><div class="editorial-grid">' + blocksHtml +
          '<div class="col-span-12 see-more-row reveal"><a href="index.html#work" class="see-more">Back to Projects <span class="arrow">&nearr;</span></a></div>' +
        '</div></section>\n' +
      '</main>\n' +
      '<footer class="footer" data-asset="footer-banner.png"><p class="footer__note">made in 2026 With An Unparalleled Urge To Seek Ideas!</p></footer>\n' +
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"><\/script>\n' +
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"><\/script>\n' +
      '<script src="script.js"><\/script>\n' +
      '</body>\n</html>';
  }

  // ============================================================
  // 11. EXPORT — folder picker, ZIP fallback
  // ============================================================
  async function exportProject() {
    const slug = makeSlug(state.meta.client) || "custom";
    const htmlName = "project-" + slug + ".html";
    const html = compileHtml();

    if ("showDirectoryPicker" in window) {
      try {
        const dir = await window.showDirectoryPicker({ mode: "readwrite" });
        await writeFile(dir, htmlName, new Blob([html], { type: "text/html;charset=utf-8" }));
        const used = collectUsedImages();
        if (used.length) {
          const imagesDir = await dir.getDirectoryHandle("images", { create: true });
          for (const name of used) await writeFile(imagesDir, name, images[name]);
        }
        alert("Exported '" + htmlName + "'" + (used.length ? " + " + used.length + " image(s)" : "") + ".");
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
        console.error(err);
        alert("Folder export failed (" + err.message + "). Falling back to ZIP download.");
      }
    }

    const JSZipCtor = window.JSZip;
    if (typeof JSZipCtor === "undefined") { alert("Folder picker unsupported and JSZip didn't load."); return; }
    const zip = new JSZipCtor();
    zip.file(htmlName, html);
    const used = collectUsedImages();
    if (used.length) {
      const folder = zip.folder("images");
      for (const name of used) folder.file(name, images[name]);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    triggerDownload(blob, "project-" + slug + ".zip");
  }

  async function writeFile(dirHandle, name, blob) {
    const handle = await dirHandle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  function collectUsedImages() {
    const used = new Set();
    function check(name) { if (name && images[name]) used.add(name); }
    check(state.hero.image);
    state.blocks.forEach(function (b) { check(b.asset); check(b.leftAsset); check(b.rightAsset); check(b.bgAsset); });
    return Array.from(used);
  }

  function triggerDownload(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
  }

  // ============================================================
  // 12. DRAFT SAVE / LOAD
  // ============================================================
  async function saveDraft() {
    const draft = { meta: state.meta, hero: state.hero, blocks: state.blocks, images: {} };
    for (const name of Object.keys(images)) draft.images[name] = await blobToDataUrl(images[name]);
    const slug = makeSlug(state.meta.client) || "draft";
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json;charset=utf-8" });
    triggerDownload(blob, "config-case-" + slug + ".json");
  }

  function loadDraft(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed.meta || !parsed.hero || !parsed.blocks) throw new Error("Missing meta/hero/blocks");
        state = { meta: parsed.meta, hero: parsed.hero, blocks: parsed.blocks };
        Object.keys(images).forEach(function (n) {
          if (blobUrlCache[n]) URL.revokeObjectURL(blobUrlCache[n]);
          delete blobUrlCache[n]; delete images[n];
        });
        if (parsed.images) {
          Object.keys(parsed.images).forEach(function (name) { images[name] = dataUrlToBlob(parsed.images[name]); });
        }
        syncMetaToForm();
        render();
      } catch (err) {
        alert("Error loading draft: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ============================================================
  // 13. BUTTON WIRING
  // ============================================================
  document.getElementById("btn-export").addEventListener("click", exportProject);
  document.getElementById("btn-save").addEventListener("click", saveDraft);
  document.getElementById("btn-load").addEventListener("click", function () { importFileInput.click(); });
  importFileInput.addEventListener("change", function (e) {
    const f = e.target.files && e.target.files[0];
    if (f) loadDraft(f);
    importFileInput.value = "";
  });

  // ============================================================
  // 14. INIT
  // ============================================================
  syncMetaToForm();
  render();

})();
