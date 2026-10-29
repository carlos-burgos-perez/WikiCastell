const $ = selector => document.querySelector(selector);
const api = '/api/wiki';
const state = { manifest: { pages: [], categories: [] }, token: sessionStorage.getItem('wiki-admin-token'), current: null, isNew: false };

const escapeHtml = (value = '') => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const slugify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function json(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    const detail = data.error || `El servidor respondió con el error ${response.status}${response.statusText ? ` (${response.statusText})` : ''}.`;
    throw new Error(detail);
  }
  if (!data || typeof data !== 'object') throw new Error('El servidor devolvió una respuesta no válida.');
  return data;
}

function renderMarkdownLegacy(source = '') {
  let html = escapeHtml(source);
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>');
  html = html.replace(/(?:^|\n)- (.*)(?=\n|$)/g, '<li>$1</li>').replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
  return html.split(/\n{2,}/).map(block => /^<(h\d|ul|blockquote)/.test(block) ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`).join('');
}
function bodyMarkdown(source) { return source.replace(/^# .*(?:\r?\n|$)/, '').trim(); }
function htmlToMarkdown(html) {
  const root = document.createElement('div'); root.innerHTML = html;
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    const content = [...node.childNodes].map(walk).join('');
    const tag = node.nodeName.toLowerCase();
    if (tag === 'h2') return `\n\n## ${content.trim()}\n\n`;
    if (tag === 'h3') return `\n\n### ${content.trim()}\n\n`;
    if (tag === 'strong' || tag === 'b') return `**${content}**`;
    if (tag === 'em' || tag === 'i') return `*${content}*`;
    if (tag === 'code') return `\`${content}\``;
    if (tag === 'blockquote') return `\n\n> ${content.trim()}\n\n`;
    if (tag === 'li') return `- ${content.trim()}\n`;
    if (tag === 'ul' || tag === 'ol') return `\n${content}\n`;
    if (tag === 'a') return `[${content}](${node.getAttribute('href') || ''})`;
    if (tag === 'br') return '\n';
    if (tag === 'p' || tag === 'div') return `\n\n${content.trim()}\n\n`;
    return content;
  };
  return [...root.childNodes].map(walk).join('').replace(/\n{3,}/g, '\n\n').trim();
}

function updateCategoryOptions() { $('#category-options').innerHTML = state.manifest.categories.map(category => `<option value="${escapeHtml(category)}">`).join(''); }
function renderNavigation() {
  const nav = $('#navigation'); nav.innerHTML = ''; const pages = state.manifest.pages;
  const addPage = (page, container, ancestry = []) => {
    if (ancestry.includes(page.slug)) return;
    const link = document.createElement('a'); link.className = 'page-link'; link.href = `#${page.slug}`; link.textContent = page.title; link.addEventListener('click', () => setTimeout(() => loadPage(page.slug))); container.append(link);
    const children = pages.filter(item => item.parent === page.slug);
    if (children.length) { const nested = document.createElement('div'); nested.className = 'subpages'; children.sort((a, b) => a.title.localeCompare(b.title, 'es')).forEach(child => addPage(child, nested, [...ancestry, page.slug])); container.append(nested); }
  };
  state.manifest.categories.forEach(category => {
    const roots = pages.filter(page => page.category === category && (!page.parent || !pages.some(candidate => candidate.slug === page.parent)));
    if (!roots.length) return;
    nav.insertAdjacentHTML('beforeend', `<div class="category">${escapeHtml(category)}</div>`);
    roots.sort((a, b) => a.title.localeCompare(b.title, 'es')).forEach(page => addPage(page, nav));
  });
  updateCategoryOptions();
}
function refreshSession() {
  $('#login-button').textContent = state.token ? 'Cerrar sesión' : 'Acceder';
  $('#new-page').classList.toggle('hidden', !state.token);
  $('#session-note').textContent = state.token ? 'Administrador conectado' : 'Modo lectura';
  $('#login-button').onclick = () => { if (!state.token) return $('#auth-dialog').showModal(); sessionStorage.removeItem('wiki-admin-token'); state.token = null; refreshSession(); loadPage(state.current.slug); };
}
function pageActions() { return state.token ? '<div class="edit-actions"><button class="edit-button" id="visual-edit">Editar</button><button class="edit-button" id="code-edit">Editar código</button></div>' : ''; }
async function loadPage(requestedSlug) {
  const page = state.manifest.pages.find(item => item.slug === requestedSlug) || state.manifest.pages.find(item => item.slug === 'inicio');
  if (!page) return;
  state.current = { ...page };
  document.querySelectorAll('.page-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${page.slug}`));
  $('#article').innerHTML = '<div class="loading">Cargando página…</div>';
  try { state.current.content = (await json(`${api}?slug=${encodeURIComponent(page.slug)}`)).content; }
  catch { state.current.content = await (await fetch(`content/${page.slug}.md`)).text(); }
  $('#article').innerHTML = `<div class="article-inner"><header class="article-header"><div><div class="article-category">${escapeHtml(page.category || 'General')}</div><h1>${escapeHtml(page.title)}</h1></div>${pageActions()}</header><div class="article-body">${markdown(bodyMarkdown(state.current.content))}</div><nav class="page-tabs"><span>Artículo</span><span>Discusión</span><span>Leer</span></nav></div>`;
  if (state.token) { const childButton = document.createElement('button'); childButton.className = 'edit-button'; childButton.textContent = 'Crear subpágina'; childButton.addEventListener('click', () => openEditor('visual', true, state.current.category, state.current.slug)); $('.edit-actions').prepend(childButton); }
  renderPageToc(); renderSectionEditLinks();
  renderTopPageLinks();
  $('#visual-edit')?.addEventListener('click', () => openEditor('visual', false));
  $('#code-edit')?.addEventListener('click', () => openEditor('code', false));
}
function editorPage(isNew, category) { return isNew ? { title:'', category:category || state.manifest.categories[0] || 'General', summary:'', content:'# Nueva página\n\nEscribe aquí.' } : state.current; }
function openEditor(type, isNew, presetCategory = '', presetParent = '') {
  if (!state.token) return; state.isNew = isNew; const page = editorPage(isNew, presetCategory); const prefix = type === 'code' ? 'code' : 'visual';
  $(`#${prefix}-editor-heading`).textContent = isNew ? 'Crear página' : type === 'code' ? 'Editar código' : 'Editar página';
  $(`#${prefix}-page-title`).value = page.title; $(`#${prefix}-page-category`).value = page.category; $(`#${prefix}-page-summary`).value = page.summary || '';
  updateParentOptions(prefix, isNew ? presetParent : page.parent || '');
  if (type === 'code') { $('#code-page-content').value = page.content; updateCodePreview(); }
  else { $('#visual-page-content').innerHTML = markdown(bodyMarkdown(page.content)); $('#visual-page-content').querySelectorAll('table').forEach(makeTableResizable); }
  $(`#${prefix}-editor-error`).textContent = ''; $(`#${prefix}-editor-dialog`).showModal();
}
async function save(type) {
  const prefix = type === 'code' ? 'code' : 'visual'; const title = $(`#${prefix}-page-title`).value.trim(); const category = $(`#${prefix}-page-category`).value.trim();
  const slug = state.isNew ? slugify(title) : state.current.slug;
  if (!slug || !title || !category) throw new Error('Indica un título y una categoría.');
  const content = type === 'code' ? $('#code-page-content').value : `# ${title}\n\n${htmlToMarkdown($('#visual-page-content').innerHTML)}`;
  const parent = $(`#${prefix}-page-parent`).value;
  if (parent === slug) throw new Error('Una página no puede ser su propia página superior.');
  const page = { slug, title, category, summary: $(`#${prefix}-page-summary`).value.trim(), ...(parent ? { parent } : {}) };
  const pages = state.manifest.pages.filter(item => item.slug !== slug); pages.push(page);
  const manifest = { pages, categories: [...new Set([...state.manifest.categories, category])] };
  await json(api, { method:'PUT', headers:{'content-type':'application/json', authorization:`Bearer ${state.token}`}, body:JSON.stringify({ slug, content, manifest }) });
  state.manifest = manifest; renderNavigation(); $(`#${prefix}-editor-dialog`).close(); location.hash = slug; await loadPage(slug);
}

$('#login-form').addEventListener('submit', async event => { event.preventDefault(); try { const data = await json('/api/auth', {method:'POST', body:JSON.stringify({username:$('#username').value, password:$('#password').value})}); state.token = data.token; sessionStorage.setItem('wiki-admin-token', data.token); $('#auth-dialog').close(); event.target.reset(); refreshSession(); loadPage(state.current.slug); } catch (error) { $('#login-error').textContent = error.message; } });
$('#new-page').addEventListener('click', () => openEditor('visual', true));
window.openWikiEditor = (category = '') => openEditor('visual', true, category);
$('#code-editor-form').addEventListener('submit', async event => { event.preventDefault(); try { await save('code'); } catch (error) { $('#code-editor-error').textContent = error.message; } });
$('#visual-editor-form').addEventListener('submit', async event => { event.preventDefault(); try { await save('visual'); } catch (error) { $('#visual-editor-error').textContent = error.message; } });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
document.querySelectorAll('.editor-toolbar button').forEach(button => button.addEventListener('click', () => { $('#visual-page-content').focus(); if (button.dataset.command === 'link') { const url = prompt('Dirección del enlace:'); if (url) document.execCommand('createLink', false, url); } else if (button.dataset.block) document.execCommand('formatBlock', false, button.dataset.block); else document.execCommand(button.dataset.command, false); }));
function updateCodePreview() { $('#code-preview').innerHTML = markdown(bodyMarkdown($('#code-page-content').value)); }
$('#code-page-content').addEventListener('input', updateCodePreview);
document.querySelectorAll('.font-choice').forEach(button => button.addEventListener('click', () => { document.body.classList.toggle('font-large', button.dataset.size === 'large'); document.querySelectorAll('.font-choice').forEach(item => item.classList.toggle('active', item === button)); }));
function setTheme(theme) { document.body.classList.toggle('dark', theme === 'dark'); localStorage.setItem('wiki-theme', theme); document.querySelectorAll('.theme-choice').forEach(button => button.classList.toggle('active', button.dataset.theme === theme)); }
document.querySelectorAll('.theme-choice').forEach(button => button.addEventListener('click', () => setTheme(button.dataset.theme)));
setTheme(localStorage.getItem('wiki-theme') || 'light');
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); location.hash = 'inicio'; loadPage('inicio'); });
document.querySelectorAll('.site-links a').forEach(link => link.addEventListener('click', event => { event.preventDefault(); const slug = link.getAttribute('href').slice(1); location.hash = slug; loadPage(slug); }));
$('#search-form').addEventListener('submit', event => { event.preventDefault(); const query = $('#search-input').value.trim().toLowerCase(); const page = state.manifest.pages.find(item => item.title.toLowerCase().includes(query)); if (page) { location.hash = page.slug; loadPage(page.slug); } });
async function init() { const base = await json('content/manifest.json'); state.manifest = base; try { const remote = (await json(`${api}?type=manifest`)).manifest; if (remote.pages?.length) { const pages = new Map(base.pages.map(page => [page.slug, page])); remote.pages.forEach(page => pages.set(page.slug, page)); state.manifest = { pages:[...pages.values()], categories:[...new Set([...base.categories, ...remote.categories])] }; } } catch {} renderNavigation(); refreshSession(); loadPage(location.hash.slice(1) || 'inicio'); }
// Markdown enriquecido: tablas, imágenes, enlaces y listas numeradas.
function inlineMarkdown(source = '') {
  return source
    .replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}
function markdownTable(lines, widths = []) {
  const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(cell => inlineMarkdown(cell.trim()));
  const header = cells(lines[0]);
  const rows = lines.slice(2).filter(line => line.trim()).map(line => `<tr>${cells(line).map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${header.map((cell, index) => `<th${widths[index] ? ` style="width:${widths[index]}"` : ''}>${cell}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderMarkdownStandard(source = '') {
  const lines = escapeHtml(source).split(/\r?\n/); let output = ''; let index = 0; let pendingWidths = [];
  const isTable = at => /^\s*\|?.+\|.+\|?\s*$/.test(lines[at] || '') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[at + 1] || '');
  while (index < lines.length) {
    if (!lines[index].trim()) { index++; continue; }
    const widthLine = lines[index].match(/^:::anchos\s+(.+)$/i); if (widthLine) { pendingWidths = widthLine[1].split(',').map(width => width.trim()).filter(width => /^\d+(?:\.\d+)?%$/.test(width)); index++; continue; }
    if (isTable(index)) { const tableLines = [lines[index], lines[index + 1]]; index += 2; while (index < lines.length && /^\s*\|?.+\|.+\|?\s*$/.test(lines[index])) tableLines.push(lines[index++]); output += markdownTable(tableLines, pendingWidths); pendingWidths = []; continue; }
    const heading = lines[index].match(/^(#{1,3})\s+(.*)$/);
    if (heading) { const level = heading[1].length; output += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`; index++; continue; }
    if (/^>\s?/.test(lines[index])) { const quote = []; while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, '')); output += `<blockquote>${inlineMarkdown(quote.join('<br>'))}</blockquote>`; continue; }
    if (/^[-*]\s+/.test(lines[index]) || /^\d+\.\s+/.test(lines[index])) { const ordered = /^\d+\.\s+/.test(lines[index]); const pattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/; const items = []; while (index < lines.length && pattern.test(lines[index])) items.push(`<li>${inlineMarkdown(lines[index++].replace(pattern, ''))}</li>`); output += `<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`; continue; }
    const paragraph = []; while (index < lines.length && lines[index].trim() && !isTable(index) && !/^(#{1,3})\s+|^>\s?|^[-*]\s+|^\d+\.\s+/.test(lines[index])) paragraph.push(lines[index++]); output += `<p>${inlineMarkdown(paragraph.join('<br>'))}</p>`;
  }
  return output;
}
function htmlToMarkdown(html) {
  const root = document.createElement('div'); root.innerHTML = html;
  const walk = node => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    const content = [...node.childNodes].map(walk).join(''); const tag = node.nodeName.toLowerCase();
    if (tag === 'h2') return `\n\n## ${content.trim()}\n\n`;
    if (tag === 'h3') return `\n\n### ${content.trim()}\n\n`;
    if (tag === 'strong' || tag === 'b') return `**${content}**`;
    if (tag === 'em' || tag === 'i') return `*${content}*`;
    if (tag === 'code') return `\`${content}\``;
    if (tag === 'blockquote') return `\n\n> ${content.trim()}\n\n`;
    if (tag === 'li') return `- ${content.trim()}\n`;
    if (tag === 'ol') return `\n${[...node.children].map((item, index) => `${index + 1}. ${walk(item).replace(/^- /, '').trim()}`).join('\n')}\n`;
    if (tag === 'ul') return `\n${content}\n`;
    if (tag === 'a') return `[${content}](${node.getAttribute('href') || ''})`;
    if (tag === 'img') return `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`;
    if (tag === 'details') { const summary = node.querySelector(':scope > summary'); const body = [...node.childNodes].filter(child => child !== summary).map(walk).join('').trim(); return `\n\n:::desplegable ${summary ? walk(summary).trim() : 'Más información'}\n${body}\n:::\n\n`; }
    if (tag === 'summary') return content;
    if (tag === 'th' || tag === 'td') return content.trim().replace(/\|/g, '\\|');
    if (tag === 'tr') return `| ${[...node.children].map(walk).join(' | ')} |\n`;
    if (tag === 'thead') { const row = node.querySelector('tr'); return `${row ? walk(row) : ''}| ${Array(row ? row.children.length : 0).fill('---').join(' | ')} |\n`; }
    if (tag === 'tbody' || (tag === 'div' && node.classList.contains('table-wrap'))) return content;
    if (tag === 'table') { const widths = [...node.querySelectorAll(':scope > thead th')].map(cell => cell.style.width).filter(Boolean); return `${widths.length ? `:::anchos ${widths.join(', ')}\n` : ''}${content}`; }
    if (tag === 'br') return '\n';
    if (tag === 'p' || tag === 'div') return `\n\n${content.trim()}\n\n`;
    return content;
  };
  return [...root.childNodes].map(walk).join('').replace(/\n{3,}/g, '\n\n').trim();
}
function markdown(source = '') {
  const lines = source.split(/\r?\n/); const parts = []; let text = [];
  const flush = () => { if (text.length) { parts.push(renderMarkdownStandard(text.join('\n'))); text = []; } };
  for (let index = 0; index < lines.length; index++) {
    const start = lines[index].match(/^:::desplegable\s*(.*)$/i);
    if (!start) { text.push(lines[index]); continue; }
    flush(); const body = []; index++;
    while (index < lines.length && lines[index].trim() !== ':::') body.push(lines[index++]);
    parts.push(`<details><summary>${inlineMarkdown(escapeHtml(start[1] || 'Más información'))}</summary><div class="details-content">${markdown(body.join('\n'))}</div></details>`);
  }
  flush(); return parts.join('');
}
function makeTableResizable(table) {
  if (table.dataset.resizable) return; table.dataset.resizable = 'true';
  const headers = [...table.querySelectorAll('thead th')];
  headers.slice(0, -1).forEach((header, index) => {
    const handle = document.createElement('span'); handle.className = 'table-resize-handle'; handle.contentEditable = 'false'; header.append(handle);
    handle.addEventListener('pointerdown', event => {
      event.preventDefault(); event.stopPropagation(); const next = headers[index + 1]; const tableWidth = table.getBoundingClientRect().width; const startX = event.clientX;
      const initial = headers.map(cell => cell.getBoundingClientRect().width / tableWidth * 100); headers.forEach((cell, column) => { cell.style.width = `${initial[column]}%`; });
      const resize = move => { const rawChange = (move.clientX - startX) / tableWidth * 100; const change = Math.min(initial[index + 1] - 6, Math.max(6 - initial[index], rawChange)); header.style.width = `${initial[index] + change}%`; next.style.width = `${initial[index + 1] - change}%`; };
      const stop = () => { document.removeEventListener('pointermove', resize); document.removeEventListener('pointerup', stop); };
      document.addEventListener('pointermove', resize); document.addEventListener('pointerup', stop);
    });
  });
}
function insertHtmlAtCursor(html) {
  const editor = $('#visual-page-content'); editor.focus(); requestAnimationFrame(() => editor.querySelectorAll('table').forEach(makeTableResizable));
  const selection = window.getSelection();
  if (!selection.rangeCount || !editor.contains(selection.getRangeAt(0).commonAncestorContainer)) { editor.insertAdjacentHTML('beforeend', html); return; }
  const range = selection.getRangeAt(0); range.deleteContents(); const fragment = range.createContextualFragment(html); const last = fragment.lastChild; range.insertNode(fragment); if (last) { range.setStartAfter(last); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); }
}
function insertTable() {
  const columns = Math.min(8, Math.max(1, Number(prompt('Número de columnas:', '3')) || 3));
  const rows = Math.min(20, Math.max(1, Number(prompt('Número de filas de contenido:', '2')) || 2));
  const header = Array.from({ length: columns }, (_, index) => `<th>Columna ${index + 1}</th>`).join('');
  const body = Array.from({ length: rows }, () => `<tr>${Array.from({ length: columns }, () => '<td>Escribe aquí</td>').join('')}</tr>`).join('');
  insertHtmlAtCursor(`<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div><p><br></p>`);
}
function insertImage() {
  const url = prompt('Dirección de la imagen (URL):'); if (!url) return;
  try { const safeUrl = new URL(url, location.href); if (!['http:', 'https:'].includes(safeUrl.protocol)) throw new Error(); const alt = prompt('Texto alternativo de la imagen:', '') || ''; insertHtmlAtCursor(`<p><img src="${escapeHtml(safeUrl.href)}" alt="${escapeHtml(alt)}"></p>`); }
  catch { $('#visual-editor-error').textContent = 'Introduce una URL de imagen válida (http o https).'; }
}
function insertDetails() {
  const title = (prompt('Título del desplegable:', 'Más información') || '').trim(); if (!title) return;
  insertHtmlAtCursor(`<details><summary>${escapeHtml(title)}</summary><div class="details-content"><p>Escribe aquí el contenido del desplegable.</p></div></details><p><br></p>`);
}
function updateParentOptions(prefix, selectedParent = '') {
  const form = $(`#${prefix}-editor-form`); let label = form.querySelector(`label[for="${prefix}-page-parent"]`);
  if (!label) { label = document.createElement('label'); label.htmlFor = `${prefix}-page-parent`; label.textContent = 'Página superior'; const select = document.createElement('select'); select.id = `${prefix}-page-parent`; label.append(select); form.querySelector('.field-row').insertAdjacentElement('afterend', label); }
  const select = label.querySelector('select'); const currentSlug = state.isNew ? '' : state.current?.slug;
  const belongsBelowCurrent = page => { let cursor = page; const visited = new Set(); while (cursor?.parent && !visited.has(cursor.slug)) { if (cursor.parent === currentSlug) return true; visited.add(cursor.slug); cursor = state.manifest.pages.find(item => item.slug === cursor.parent); } return false; };
  const options = state.manifest.pages.filter(page => page.slug !== currentSlug && !belongsBelowCurrent(page)).sort((a, b) => a.title.localeCompare(b.title, 'es'));
  select.innerHTML = `<option value="">Sin página superior</option>${options.map(page => `<option value="${escapeHtml(page.slug)}">${escapeHtml(page.title)}</option>`).join('')}`; select.value = selectedParent;
}
const subpageStyle = document.createElement('style');
subpageStyle.textContent = '.subpages{margin-left:13px;padding-left:8px;border-left:1px solid var(--line)}.subpages .page-link{font-size:.86rem}#code-page-parent,#visual-page-parent{display:block;width:100%;margin-top:5px;padding:9px 10px;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:6px}';
document.head.append(subpageStyle);
const sectionEditorStyle = document.createElement('style');
sectionEditorStyle.textContent = '.page-edit-links{display:flex;gap:10px;align-items:center;font-size:.85rem}.page-edit-links a,.section-edit{color:var(--accent);text-decoration:none}.page-edit-links a:hover,.section-edit:hover{text-decoration:underline}.section-edit{font:normal .72rem system-ui,-apple-system,sans-serif;white-space:nowrap}.section-editor-dialog{width:min(850px,calc(100% - 28px));max-height:calc(100vh - 28px);border:1px solid var(--line);border-radius:5px;background:var(--surface);color:var(--text);box-shadow:0 18px 60px #0006}.section-editor-dialog form{padding:28px;max-height:calc(100vh - 28px);overflow:auto;position:relative}.section-editor-dialog header{padding-right:32px;border-bottom:1px solid var(--line);margin-bottom:14px}.section-editor-dialog header h2{margin:0;font:25px Georgia,serif}.section-editor-dialog header p{margin:3px 0 12px;color:var(--muted)}.section-editor-toolbar{display:flex;gap:4px;padding:7px;border:1px solid var(--line);border-bottom:0;background:var(--code)}.section-editor-toolbar button{border:1px solid transparent;background:transparent;color:var(--text);padding:4px 9px}.section-editor-toolbar button:hover{border-color:var(--line);background:var(--surface)}.section-editor-content{min-height:300px;padding:18px 21px;border:1px solid var(--line);background:#fff;color:#202122;outline:0}.section-editor-content:focus{box-shadow:inset 0 0 0 2px #36c}@media(max-width:700px){.page-edit-links{gap:6px;font-size:.76rem}.topbar{height:auto;min-height:64px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}.section-editor-dialog form{padding:22px 18px}}';
document.head.append(sectionEditorStyle);
const topEditLinksStyle = document.createElement('style');
topEditLinksStyle.textContent = '.page-edit-links{margin-left:auto}.page-edit-links + .search{margin-left:0!important}@media(max-width:700px){.page-edit-links{order:3;margin-left:0}.page-edit-links + .search{margin-left:auto!important;order:4}}';
document.head.append(topEditLinksStyle);
const editorTableStyle = document.createElement('style');
editorTableStyle.textContent = '.visual-content table,.section-editor-content table{width:100%;border-collapse:collapse!important;border:1px solid #a2a9b1!important}.visual-content th,.visual-content td,.section-editor-content th,.section-editor-content td{border:1px solid #a2a9b1!important;padding:7px 10px!important;text-align:left;vertical-align:top}.visual-content th,.section-editor-content th{background:#eaecf0!important}';
document.head.append(editorTableStyle);
const darkThemeStyle = document.createElement('style');
darkThemeStyle.textContent = 'body.dark{--bg:#141820;--surface:#1c222c;--text:#e7ebf2;--muted:#a9b4c4;--line:#3a4555;--softline:#303a48;--code:#252d38;--card:#222a35;--accent:#93b7ff;--accent-soft:#263b60}body.dark .wiki-mark{background:radial-gradient(circle at 35% 35%,#3a4658,#202732)!important;border-color:#647188!important;color:#edf2fb!important}body.dark .category-card{background:var(--card)!important;border-color:var(--line)!important}body.dark .visual-content,body.dark .code-preview-pane article,body.dark .section-editor-content{background:#202731!important;color:#e7ebf2!important;border-color:#3d4959!important}body.dark .visual-content h2,body.dark .code-preview-pane h2{border-color:#4a5666!important}body.dark .visual-content blockquote,body.dark .section-editor-content blockquote{background:#272f3b!important;border-color:#647188!important;color:#c4cedc!important}body.dark .editor-dialog,body.dark .auth-dialog,body.dark .section-editor-dialog{border-color:#465264!important}body.dark .visual-content table,body.dark .section-editor-content table,body.dark .article-body table{border-color:#4a5668!important}body.dark .visual-content th,body.dark .visual-content td,body.dark .section-editor-content th,body.dark .section-editor-content td,body.dark .article-body th,body.dark .article-body td{border-color:#4a5668!important;color:#e7ebf2!important}body.dark .visual-content th,body.dark .section-editor-content th,body.dark .article-body th{background:#303a48!important;color:#f0f4fa!important}body.dark .article-body tr:nth-child(even) td{background:#202833!important}body.dark .code-preview-pane article table th{background:#303a48!important}body.dark .code-preview-pane article table td,body.dark .code-preview-pane article table th{border-color:#4a5668!important}body.dark .section-editor-toolbar,body.dark .editor-toolbar{background:#252d38!important}body.dark .section-editor-content:focus,body.dark .visual-content:focus{box-shadow:inset 0 0 0 2px #7ca8ff!important}';
document.head.append(darkThemeStyle);
const previewTableStyle = document.createElement('style');
previewTableStyle.textContent = 'body.dark .code-preview-pane article table{border-collapse:collapse;width:100%}body.dark .code-preview-pane article th,body.dark .code-preview-pane article td{border:1px solid #4a5668!important;padding:7px 10px;color:#e7ebf2}body.dark .code-preview-pane article th{background:#303a48!important}';
document.head.append(previewTableStyle);
const tocStyle = document.createElement('style');
tocStyle.textContent = '.page-toc{margin:22px 0 28px;padding:13px 16px;border:1px solid var(--line);border-radius:4px;background:var(--bg);max-width:520px}.page-toc strong{display:block;margin-bottom:5px}.page-toc-list{margin:0;padding-left:22px}.page-toc-list li{margin:2px 0}.page-toc-list button{padding:1px 3px;border:0;border-radius:0;background:transparent;color:var(--accent);font:inherit;text-align:left}.page-toc-list button:hover{text-decoration:underline}.page-toc-subtitle{margin-left:16px;font-size:.94em}';
document.head.append(tocStyle);
const tableResizeStyle = document.createElement('style');
tableResizeStyle.textContent = '.visual-content table{table-layout:fixed}.visual-content th{position:relative}.table-resize-handle{position:absolute;z-index:2;top:0;right:-5px;width:10px;height:100%;cursor:col-resize;user-select:none}.table-resize-handle:hover,.table-resize-handle:active{background:#36c5}';
document.head.append(tableResizeStyle);
const richEditorStyle = document.createElement('style');
richEditorStyle.textContent = '.editor-toolbar{flex-wrap:wrap}.editor-toolbar button[data-rich-command]{font-weight:650}.visual-content .table-wrap,.article-body .table-wrap{overflow-x:auto;margin:1em 0}.visual-content table,.article-body table{border-collapse:collapse;width:100%;min-width:360px}.visual-content th,.visual-content td,.article-body th,.article-body td{border:1px solid #a2a9b1;padding:7px 10px;text-align:left;vertical-align:top}.visual-content th,.article-body th{background:#eaecf0;font-weight:700}.visual-content td{min-width:90px}.visual-content img,.article-body img{display:block;max-width:100%;height:auto;margin:1em 0}.article-body tr:nth-child(even) td{background:var(--bg)}.visual-content details,.article-body details{margin:1em 0;border:1px solid var(--line);border-radius:4px;background:var(--surface)}.visual-content summary,.article-body summary{cursor:pointer;padding:9px 12px;font-weight:700;color:var(--accent)}.visual-content .details-content,.article-body .details-content{padding:0 12px 10px;border-top:1px solid var(--line)}';
document.head.append(richEditorStyle);
const toolbar = $('.editor-toolbar');
toolbar.insertAdjacentHTML('beforeend', '<button type="button" data-rich-command="table" title="Insertar tabla">Tabla</button><button type="button" data-rich-command="image" title="Insertar imagen">Imagen</button><button type="button" data-rich-command="details" title="Insertar desplegable">Desplegable</button>');
toolbar.querySelectorAll('[data-rich-command]').forEach(button => button.addEventListener('click', () => { if (button.dataset.richCommand === 'table') insertTable(); else if (button.dataset.richCommand === 'image') insertImage(); else insertDetails(); }));
function renderPageToc() {
  const article = $('.article-inner'); const headings = [...article.querySelectorAll('.article-body h2, .article-body h3')]; if (!headings.length) return;
  const usedIds = new Set(); const list = document.createElement('ol'); list.className = 'page-toc-list';
  headings.forEach(heading => {
    const base = slugify(heading.textContent) || 'seccion'; let id = base; let number = 2; while (usedIds.has(id)) id = `${base}-${number++}`; usedIds.add(id); heading.id = id;
    const item = document.createElement('li'); item.className = heading.tagName === 'H3' ? 'page-toc-subtitle' : 'page-toc-title'; const button = document.createElement('button'); button.type = 'button'; button.textContent = heading.textContent; button.addEventListener('click', () => heading.scrollIntoView({ behavior: 'smooth', block: 'start' })); item.append(button); list.append(item);
  });
  const toc = document.createElement('nav'); toc.className = 'page-toc'; toc.setAttribute('aria-label', 'Índice de la página'); toc.innerHTML = '<strong>Índice</strong>'; toc.append(list); article.querySelector('.article-header').insertAdjacentElement('afterend', toc);
}
function renderTopPageLinks() {
  const search = $('#search-form'); document.querySelector('.page-edit-links')?.remove(); $('.edit-actions')?.remove(); if (!state.token) return;
  const links = document.createElement('span'); links.className = 'page-edit-links'; links.innerHTML = '<a href="#" data-page-action="child">Crear subpágina</a><a href="#" data-page-action="edit">Editar página</a><a href="#" data-page-action="code">Editar código</a>';
  links.querySelectorAll('a').forEach(link => link.addEventListener('click', event => { event.preventDefault(); const action = link.dataset.pageAction; if (action === 'child') openEditor('visual', true, state.current.category, state.current.slug); else openEditor(action === 'code' ? 'code' : 'visual', false); })); search.insertAdjacentElement('beforebegin', links);
}
function getSectionNodes(heading) {
  const level = Number(heading.tagName.slice(1)); const nodes = [heading]; let current = heading.nextElementSibling;
  while (current) { if (/^H[23]$/.test(current.tagName) && Number(current.tagName.slice(1)) <= level) break; nodes.push(current); current = current.nextElementSibling; }
  return nodes;
}
function renderSectionEditLinks() {
  if (!state.token) return;
  document.querySelectorAll('.article-body h2, .article-body h3').forEach(heading => {
    const link = document.createElement('a'); link.href = '#'; link.className = 'section-edit'; link.textContent = 'editar'; link.setAttribute('aria-label', `Editar sección ${heading.textContent}`); link.addEventListener('click', event => { event.preventDefault(); openSectionEditor(heading); }); heading.append(' ', link);
  });
}
function openSectionEditor(heading) {
  const originalNodes = getSectionNodes(heading); const section = document.createElement('div'); originalNodes.forEach(node => section.append(node.cloneNode(true))); section.querySelectorAll('.section-edit').forEach(link => link.remove());
  const dialog = document.createElement('dialog'); dialog.className = 'section-editor-dialog'; dialog.innerHTML = `<form method="dialog"><button type="button" class="close" aria-label="Cerrar">×</button><header><h2>Editar sección</h2><p>Los cambios se aplicarán solo a esta sección.</p></header><div class="section-editor-toolbar"><button type="button" data-command="bold"><b>B</b></button><button type="button" data-command="italic"><i>I</i></button><button type="button" data-command="insertUnorderedList">Lista</button><button type="button" data-command="link">Enlace</button></div><div class="section-editor-content" contenteditable="true" spellcheck="true"></div><p class="error"></p><div class="editor-actions"><button type="button" class="secondary" data-cancel>Cancelar</button><button class="primary" value="save">Guardar sección</button></div></form>`;
  const content = dialog.querySelector('.section-editor-content'); content.innerHTML = section.innerHTML; document.body.append(dialog); dialog.showModal();
  const close = () => { dialog.close(); dialog.remove(); }; dialog.querySelector('.close').addEventListener('click', close); dialog.querySelector('[data-cancel]').addEventListener('click', close);
  dialog.querySelectorAll('[data-command]').forEach(button => { button.addEventListener('mousedown', event => event.preventDefault()); button.addEventListener('click', () => { content.focus(); if (button.dataset.command === 'link') { const url = prompt('Dirección del enlace:'); if (url) document.execCommand('createLink', false, url); } else document.execCommand(button.dataset.command, false); }); });
  dialog.querySelector('form').addEventListener('submit', async event => { event.preventDefault(); try {
    const replacement = [...content.children].map(node => node.cloneNode(true)); originalNodes.slice(1).forEach(node => node.remove()); originalNodes[0].replaceWith(...replacement);
    const cleanBody = $('.article-body').cloneNode(true); cleanBody.querySelectorAll('.section-edit').forEach(link => link.remove()); const updatedContent = `# ${state.current.title}\n\n${htmlToMarkdown(cleanBody.innerHTML)}`;
    await json(api, { method:'PUT', headers:{'content-type':'application/json', authorization:`Bearer ${state.token}`}, body:JSON.stringify({ slug:state.current.slug, content:updatedContent, manifest:state.manifest }) }); state.current.content = updatedContent; close(); await loadPage(state.current.slug);
  } catch (error) { dialog.querySelector('.error').textContent = error.message; } });
}
init();
