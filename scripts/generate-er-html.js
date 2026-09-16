#!/usr/bin/env node
/**
 * Regenerate ER diagram HTML from prisma/schema.prisma
 * Usage: node scripts/generate-er-html.js
 *
 * Outputs:
 *   docs/database-er-diagram.html           — tables with attributes
 *   docs/database-er-diagram-overview.html  — tables and relations only
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(ROOT, 'prisma/schema.prisma');
const OUT_DETAIL = path.join(ROOT, 'docs/database-er-diagram.html');
const OUT_OVERVIEW = path.join(ROOT, 'docs/database-er-diagram-overview.html');

const PRIMITIVE = /^(Int|String|Boolean|DateTime|Decimal|Float|BigInt|Json|Bytes)/;

function parseModels(text) {
  const models = [];
  const re = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1];
    const fields = [];
    for (const line of m[2].split('\n')) {
      const raw = line.trim();
      if (!raw || raw.startsWith('@@') || raw.startsWith('///')) continue;
      const fm = raw.match(/^(\w+)\s+([\w\[\]?]+)/);
      if (!fm) continue;
      const fname = fm[1];
      const ftypeRaw = fm[2];
      if (!PRIMITIVE.test(ftypeRaw)) continue;
      const ftype = ftypeRaw.replace(/\?/g, '');
      let tag = '';
      if (raw.includes('@id')) tag = ' PK';
      else if (
        fname.endsWith('id') ||
        ['assignedto', 'city', 'area', 'country', 'assignedby', 'addedby', 'changedby', 'traveledby', 'workedby', 'submittedby', 'rejectedby', 'fromstatus', 'tostatus', 'blockedby', 'createdby', 'lastupdatedby'].includes(fname)
      ) {
        tag = ' FK';
      }
      fields.push(`${ftype} ${fname}${tag}`);
    }
    models.push({ name, fields });
  }
  return models;
}

function parseRels(text) {
  const rels = [];
  const lineRe =
    /^\s*(\w+)\s+(\w+)(\?|\[\])?[^\n]*@relation\([^)]*fields:\s*\[(\w+)\][^)]*references:\s*\[(\w+)\]/;
  const modelBlocks = [...text.matchAll(/model\s+(\w+)\s*\{([^}]+)\}/g)];
  for (const mb of modelBlocks) {
    const from = mb[1];
    for (const line of mb[2].split('\n')) {
      const rm = line.match(lineRe);
      if (rm) rels.push({ from, to: rm[2], fromField: rm[4] });
    }
  }
  const seen = new Set();
  return rels.filter((r) => {
    const key = `${r.from}|${r.to}|${r.fromField}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMermaidDetail(models, rels) {
  let mm = 'erDiagram\n';
  for (const m of models) {
    mm += `  ${m.name} {\n`;
    for (const f of m.fields) mm += `    ${f}\n`;
    mm += '  }\n';
  }
  for (const r of rels) {
    mm += `  ${r.from} }o--|| ${r.to} : ${r.fromField}\n`;
  }
  return mm;
}

function buildMermaidOverview(models, rels) {
  let mm = 'erDiagram\n';
  for (const m of models) {
    mm += `  ${m.name}\n`;
  }
  for (const r of rels) {
    mm += `  ${r.from} }o--|| ${r.to} : ${r.fromField}\n`;
  }
  return mm;
}

function buildHtml(mermaid, { title, legend, pngName }) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    body { display: flex; flex-direction: column; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background: #0f1419; color: #e7ecf3; }
    header { width: 100%; flex-shrink: 0; padding: 12px 16px; background: #1a2332; border-bottom: 1px solid #2d3a4d; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    header h1 { margin: 0; font-size: 1.1rem; font-weight: 600; }
    header p { margin: 0; font-size: 0.85rem; color: #9fb0c5; flex: 1 1 100%; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; width: 100%; }
    button { background: #2d5a8a; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
    button:hover { background: #3a6fa8; }
    button.secondary { background: #3a4555; }
    #viewport { width: 100%; flex: 1; min-height: 0; overflow: hidden; cursor: grab; background: #121820; }
    #viewport.grabbing { cursor: grabbing; }
    #panzoom { width: 100%; transform-origin: 0 0; padding: 8px 0; }
    #diagram { width: 100%; margin: 0; display: block; }
    .mermaid { width: 100%; background: #fff; border-radius: 0; padding: 12px 0; margin: 0; }
    .legend code { color: #b8d4ff; }
    #status { font-size: 0.8rem; color: #7dd3a0; margin-left: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
    <p class="legend">${legend}</p>
    <div class="toolbar">
      <button type="button" id="zoomIn">Zoom +</button>
      <button type="button" id="zoomOut">Zoom −</button>
      <button type="button" id="resetView" class="secondary">Reset view</button>
      <button type="button" id="exportPng">Export PNG</button>
      <span id="status"></span>
    </div>
  </header>
  <div id="viewport">
    <div id="panzoom">
      <pre class="mermaid" id="diagram">${esc(mermaid)}</pre>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      er: { layoutDirection: 'LR' },
      theme: 'default',
      securityLevel: 'loose',
      themeVariables: { fontSize: '13px' }
    });

    const viewport = document.getElementById('viewport');
    const panzoom = document.getElementById('panzoom');
    let scale = 1;
    let tx = 8, ty = 8;
    let dragging = false, lastX, lastY;

    function applyTransform() {
      panzoom.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    }

    function fitToWidth() {
      const svg = document.querySelector('#diagram svg');
      if (!svg) return;
      const pad = 16;
      const bbox = svg.getBBox();
      if (!bbox.width) return;
      scale = Math.min(2.5, Math.max(0.06, (viewport.clientWidth - pad) / bbox.width));
      tx = pad / 2;
      ty = pad / 2;
      applyTransform();
    }

    const diagramObserver = new MutationObserver(() => {
      if (document.querySelector('#diagram svg')) {
        fitToWidth();
        diagramObserver.disconnect();
      }
    });
    diagramObserver.observe(document.getElementById('diagram'), { childList: true, subtree: true });
    window.addEventListener('resize', () => fitToWidth());

    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      scale = Math.min(2.5, Math.max(0.06, scale * delta));
      applyTransform();
    }, { passive: false });

    viewport.addEventListener('mousedown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      viewport.classList.add('grabbing');
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      tx += e.clientX - lastX;
      ty += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      applyTransform();
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
      viewport.classList.remove('grabbing');
    });

    document.getElementById('zoomIn').onclick = () => { scale = Math.min(2.5, scale * 1.12); applyTransform(); };
    document.getElementById('zoomOut').onclick = () => { scale = Math.max(0.06, scale / 1.12); applyTransform(); };
    document.getElementById('resetView').onclick = () => fitToWidth();

    document.getElementById('exportPng').onclick = () => {
      const status = document.getElementById('status');
      const svg = document.querySelector('#diagram svg');
      if (!svg) {
        status.textContent = 'Diagram still loading — try again';
        return;
      }
      status.textContent = 'Exporting…';
      const bbox = svg.getBBox();
      const pad = 20;
      const w = bbox.width + pad * 2;
      const h = bbox.height + pad * 2;
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      const g = clone.querySelector('g');
      if (g) g.setAttribute('transform', 'translate(' + (pad - bbox.x) + ',' + (pad - bbox.y) + ')');
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
      const img = new Image();
      img.onload = () => {
        const scale2 = 2;
        const canvas = document.createElement('canvas');
        canvas.width = w * scale2;
        canvas.height = h * scale2;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale2, scale2);
        ctx.drawImage(img, 0, 0);
        const a = document.createElement('a');
        a.download = '${pngName}';
        a.href = canvas.toDataURL('image/png');
        a.click();
        status.textContent = 'PNG saved';
      };
      img.onerror = () => { status.textContent = 'Export failed'; };
      img.src = url;
    };
  </script>
</body>
</html>`;
}

const text = fs.readFileSync(SCHEMA, 'utf8');
const models = parseModels(text);
const rels = parseRels(text);

const commonLegend =
  'From <code>prisma/schema.prisma</code>. Drag to pan · scroll to zoom · Export PNG.';

fs.mkdirSync(path.dirname(OUT_DETAIL), { recursive: true });

fs.writeFileSync(
  OUT_DETAIL,
  buildHtml(buildMermaidDetail(models, rels), {
    title: 'ConnectCMS PostgreSQL ER Diagram (with attributes)',
    legend: `${commonLegend} ${models.length} tables, ${rels.length} FK links — columns shown.`,
    pngName: 'connectcms-database-er-detail.png',
  })
);

fs.writeFileSync(
  OUT_OVERVIEW,
  buildHtml(buildMermaidOverview(models, rels), {
    title: 'ConnectCMS PostgreSQL ER Diagram (overview)',
    legend: `${commonLegend} ${models.length} tables, ${rels.length} FK links — <strong>no column attributes</strong>.`,
    pngName: 'connectcms-database-er-overview.png',
  })
);

console.log(`Wrote ${OUT_DETAIL}`);
console.log(`Wrote ${OUT_OVERVIEW} (${models.length} tables, ${rels.length} relations, no attributes)`);
