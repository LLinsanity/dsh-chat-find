/**
 * Visual harness: renders the find bar over a fake transcript using the exact
 * CSS block shipped in client.js and the documented theme tokens, so light and
 * dark appearance can be checked without reloading the app.
 * Development aid only; not part of the bundle.
 */
const fs = require('fs');
const path = require('path');

const client = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
const start = client.indexOf('const CSS_TEXT = `') + 'const CSS_TEXT = `'.length;
const css = client.slice(start, client.indexOf('`;', start));

const rows = Array.from({ length: 9 }, (_, i) =>
  `<p>第 ${i + 1} 行：长会话里检索提示词、关键词与某一轮的结论，命中后用高亮并滚动定位。</p>`,
).join('\n');

const LIGHT = `
  :root { color-scheme: light;
    --dsw-alias-bg-base:#f5f6f8; --dsw-alias-bg-layer-1:#ffffff; --dsw-alias-bg-layer-2:#f2f3f5; --dsw-alias-bg-overlay:#ffffff;
    --dsw-alias-label-primary:#1f2329; --dsw-alias-label-secondary:#5a6069; --dsw-alias-label-tertiary:#8a8f99;
    --dsw-alias-border-l1:#eceef1; --dsw-alias-border-l2:rgba(0,0,0,.16);
    --dsw-alias-state-business-primary:#3b6fe0; --dsw-alias-state-warn-primary:#f0a020; --dsw-specific-input-major:#ffffff; }
  body { background:#ffffff; color:#1f2329; }
  .bubble { background:#eef1f5; }
  .bubble.user { background:#e3eefc; }
  code { background:#e9edf2; }
`;

const DARK = `
  :root { color-scheme: dark;
    --dsw-alias-bg-base:#14161a; --dsw-alias-bg-layer-1:#262a30; --dsw-alias-bg-layer-2:#2f343b; --dsw-alias-bg-overlay:#1c1f24;
    --dsw-alias-label-primary:#eef1f5; --dsw-alias-label-secondary:#b9c0cb; --dsw-alias-label-tertiary:#8b939f;
    --dsw-alias-border-l1:#2f343b; --dsw-alias-border-l2:rgba(255,255,255,.18);
    --dsw-alias-state-business-primary:#6f9bff; --dsw-alias-state-warn-primary:#f0b429; --dsw-specific-input-major:#24272d; }
  body { background:#14161a; color:#eef1f5; }
  .bubble { background:#23272e; }
  .bubble.user { background:#1d3557; }
  code { background:#2c313a; }
`;

function page(tokens) {
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<style>
${tokens}
  body { margin: 0; font: 14px/1.7 -apple-system, "Segoe UI", system-ui, sans-serif; }
  .page { padding: 24px 32px 60px; }
  .bubble { max-width: 520px; margin: 0 auto 14px; padding: 8px 12px; border-radius: 10px; }
  .page-wrap { max-width: 720px; margin: 0 auto; }
  p { margin: 0 0 12px; }
  code { padding: 1px 5px; border-radius: 4px; }
</style></head>
<body>
<div class="page"><div class="page-wrap">
  ${rows}
  <div class="bubble user">第 10 行：浅色外观下搜索框有点发黑，请把玻璃调亮一点。</div>
  ${rows}
</div></div>

<style>${css}</style>
<div class="cf-root" style="top:56px;left:450px;animation:none">
  <div class="cf-bar">
    <span class="cf-glass">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.6" stroke="currentColor" stroke-width="1.4"/><path d="M10.4 10.4L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    </span>
    <input class="cf-input" value="检索" placeholder="在当前对话中查找">
    <span class="cf-count">3/12</span>
    <button class="cf-btn" type="button">↑</button>
    <button class="cf-btn" type="button">↓</button>
    <button class="cf-btn" type="button">⟳</button>
    <button class="cf-btn" type="button">✕</button>
  </div>
  <div class="cf-foot"><span>搜索你的消息与回复内容</span></div>
</div>
</body></html>`;
}

const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'preview-light.html'), page(LIGHT));
fs.writeFileSync(path.join(out, 'preview-dark.html'), page(DARK));
console.log('wrote test/out/preview-light.html and preview-dark.html');
