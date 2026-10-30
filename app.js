const $ = selector => document.querySelector(selector);
const api = '/api/wiki';
const state = { manifest: { pages: [], categories: [] }, token: sessionStorage.getItem('wiki-admin-token'), current: null, isNew: false };

const escapeHtml = (value = '') => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const slugify = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
async function json(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch {
    if (response.ok) throw new Error('El servidor devolvió una respuesta no válida.');
    data = {};
  }
  if (!response.ok) {
    const detail = data.error || `El servidor respondió con el error ${response.status}${response.statusText ? ` (${response.statusText})` : ''}.`;
    const error = new Error(detail);
    error.status = response.status;
    throw error;
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
    if (tag === 'h4') return `\n\n#### ${content.trim()}\n\n`;
    if (tag === 'h5') return `\n\n##### ${content.trim()}\n\n`;
    if (tag === 'h6') return `\n\n###### ${content.trim()}\n\n`;
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
function comparePageOrder(a, b) {
  const aOrder = Number.isInteger(a.order) && a.order > 0 ? a.order : null;
  const bOrder = Number.isInteger(b.order) && b.order > 0 ? b.order : null;
  if (aOrder !== null && bOrder !== null && aOrder !== bOrder) return aOrder - bOrder;
  if (aOrder !== null && bOrder === null) return -1;
  if (aOrder === null && bOrder !== null) return 1;
  return a.title.localeCompare(b.title, 'es');
}
function orderedPages(pages) { return [...pages].sort(comparePageOrder); }
function pageOrderGroupKey(page) {
  return page.parent ? JSON.stringify(['parent', page.parent]) : JSON.stringify(['category', page.category || '']);
}
function normalizePageOrders(pages, insertedPage = null, position = 1) {
  const groups = new Map();
  let insertedKey = null;
  pages.forEach(page => {
    const key = pageOrderGroupKey(page);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(page);
  });
  if (insertedPage) {
    const key = pageOrderGroupKey(insertedPage);
    insertedKey = key;
    if (!groups.has(key)) groups.set(key, []);
    const group = orderedPages(groups.get(key).filter(page => page.slug !== insertedPage.slug));
    group.splice(Math.min(position - 1, group.length), 0, insertedPage);
    groups.set(key, group);
  }
  return [...groups.entries()].flatMap(([key, group]) =>
    (key === insertedKey ? group : orderedPages(group)).map((page, index) => ({ ...page, order: index + 1 })));
}
function pageOrderInGroup(page) {
  const key = pageOrderGroupKey(page);
  const siblings = state.manifest.pages.filter(item => item.slug !== page.slug && pageOrderGroupKey(item) === key);
  return orderedPages([...siblings, page]).findIndex(item => item.slug === page.slug) + 1;
}
function renderNavigation() {
  const nav = $('#navigation'); nav.innerHTML = ''; const pages = state.manifest.pages;
  const addPage = (page, container, ancestry = []) => {
    if (page.hidden || ancestry.includes(page.slug)) return;
    const link = document.createElement('a'); link.className = 'page-link'; link.href = `#${page.slug}`; link.textContent = page.title; link.addEventListener('click', () => setTimeout(() => loadPage(page.slug))); container.append(link);
    const children = pages.filter(item => item.parent === page.slug && !item.hidden);
    if (children.length) { const nested = document.createElement('div'); nested.className = 'subpages'; orderedPages(children).forEach(child => addPage(child, nested, [...ancestry, page.slug])); container.append(nested); }
  };
  state.manifest.categories.forEach(category => {
    if ((state.manifest.hiddenCategories || []).includes(category)) return;
    const roots = pages.filter(page => page.category === category && (!page.parent || !pages.some(candidate => candidate.slug === page.parent)));
    nav.insertAdjacentHTML('beforeend', `<div class="category">${escapeHtml(category)}</div>`);
    orderedPages(roots).forEach(page => addPage(page, nav));
  });
  updateCategoryOptions();
}
function renderCategoryManager() {
  const list = $('#category-manager-list');
  list.replaceChildren();
  state.manifest.categories.forEach(category => {
    const item = document.createElement('li');
    item.className = 'category-manager-item';
    item.classList.toggle('category-hidden', (state.manifest.hiddenCategories || []).includes(category));
    item.draggable = !categoriesBusy;
    item.dataset.category = category;
    const name = document.createElement('span');
    name.className = 'category-manager-name';
    name.title = 'Arrastra para cambiar el orden';
    name.setAttribute('aria-label', `Arrastrar categoría: ${category}`);
    name.textContent = category;
    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'toggle-category-visibility';
    visibility.textContent = (state.manifest.hiddenCategories || []).includes(category) ? 'Mostrar' : 'Ocultar';
    visibility.title = `${visibility.textContent} categoría`;
    visibility.disabled = categoriesBusy;
    visibility.setAttribute('aria-label', `${visibility.textContent} categoría: ${category}`);
    visibility.addEventListener('click', () => toggleCategoryVisibility(category));
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'rename-category';
    rename.textContent = 'Renombrar';
    rename.disabled = categoriesBusy;
    rename.setAttribute('aria-label', `Renombrar categoría: ${category}`);
    rename.addEventListener('click', () => renameCategory(category));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-category';
    remove.textContent = 'Eliminar';
    remove.disabled = categoriesBusy;
    remove.setAttribute('aria-label', `Eliminar categoría: ${category}`);
    remove.addEventListener('click', () => deleteCategory(category));
    item.append(name, visibility, rename, remove);
    list.append(item);
  });
  $('#add-category').disabled = categoriesBusy;
  $('#new-category-name').disabled = categoriesBusy;
}
function clearCategoryDropTargets() {
  $('#category-manager-list').querySelectorAll('.drop-before, .drop-after, .category-dragging').forEach(item => {
    item.classList.remove('drop-before', 'drop-after', 'category-dragging');
  });
}
function reorderCategory(draggedCategory, targetCategory, insertAfter) {
  const categories = [...state.manifest.categories];
  const sourceIndex = categories.indexOf(draggedCategory);
  const targetIndex = categories.indexOf(targetCategory);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  categories.splice(sourceIndex, 1);
  const adjustedTarget = categories.indexOf(targetCategory);
  categories.splice(adjustedTarget + (insertAfter ? 1 : 0), 0, draggedCategory);
  saveCategories(categories).catch(() => {});
}
const categoryList = $('#category-manager-list');
categoryList.addEventListener('dragstart', event => {
  const item = event.target.closest('.category-manager-item');
  if (!item || categoriesBusy) { event.preventDefault(); return; }
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', item.dataset.category);
  requestAnimationFrame(() => item.classList.add('category-dragging'));
});
categoryList.addEventListener('dragover', event => {
  const item = event.target.closest('.category-manager-item');
  if (!item || categoriesBusy || !event.dataTransfer.types.includes('text/plain')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const after = event.clientY > item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
  item.classList.toggle('drop-after', after);
  item.classList.toggle('drop-before', !after);
});
categoryList.addEventListener('drop', event => {
  const target = event.target.closest('.category-manager-item');
  const draggedCategory = event.dataTransfer.getData('text/plain');
  if (!target || !draggedCategory || categoriesBusy) return;
  event.preventDefault();
  const insertAfter = event.clientY > target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
  reorderCategory(draggedCategory, target.dataset.category, insertAfter);
  clearCategoryDropTargets();
});
categoryList.addEventListener('dragend', clearCategoryDropTargets);
let categoriesBusy = false;
async function saveCategories(categories, categoryChange = {}) {
  if (categoriesBusy) return;
  categoriesBusy = true;
  renderCategoryManager();
  $('#category-manager-error').textContent = '';
  try {
    await json(api, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ categories, ...categoryChange })
    });
    state.manifest.categories = categories;
    if (categoryChange.hiddenCategories) state.manifest.hiddenCategories = categoryChange.hiddenCategories;
    if (categoryChange.deleteCategory) {
      state.manifest.hiddenCategories = (state.manifest.hiddenCategories || []).filter(item => item !== categoryChange.deleteCategory);
    }
    if (categoryChange.renameCategory) {
      state.manifest.pages = state.manifest.pages.map(page =>
        page.category === categoryChange.renameCategory ? { ...page, category: categoryChange.newCategoryName } : page
      );
      state.manifest.hiddenCategories = (state.manifest.hiddenCategories || []).map(category =>
        category === categoryChange.renameCategory ? categoryChange.newCategoryName : category
      );
      state.manifest.pages = normalizePageOrders(state.manifest.pages);
    }
    const refreshCurrentPage = (categoryChange.deleteCategory && state.current?.category === categoryChange.deleteCategory) ||
      (categoryChange.renameCategory && state.current?.category === categoryChange.renameCategory);
    if (categoryChange.renameCategory && state.current?.category === categoryChange.renameCategory) {
      state.current.category = categoryChange.newCategoryName;
    }
    if (categoryChange.deleteCategory && state.manifest.pages.some(page => page.category === categoryChange.deleteCategory)) {
      state.manifest.pages = normalizePageOrders(state.manifest.pages.map(page =>
        page.category === categoryChange.deleteCategory ? { ...page, category: categoryChange.movePagesTo } : page
      ));
    }
    document.querySelector('.home-categories')?.remove();
    document.querySelector('.all-pages-index')?.remove();
    renderNavigation();
    renderCategoryManager();
    if (refreshCurrentPage) await loadPage(state.current.slug);
  } catch (error) {
    $('#category-manager-error').textContent = error.message;
    throw error;
  } finally {
    categoriesBusy = false;
    renderCategoryManager();
  }
}
async function toggleCategoryVisibility(category) {
  const hiddenCategories = new Set(state.manifest.hiddenCategories || []);
  if (hiddenCategories.has(category)) hiddenCategories.delete(category);
  else hiddenCategories.add(category);
  try { await saveCategories(state.manifest.categories, { hiddenCategories: [...hiddenCategories] }); }
  catch { /* The error is shown in the category manager. */ }
}
async function renameCategory(category) {
  const answer = window.prompt(`Nuevo nombre para la categoría «${category}»:`, category);
  if (answer === null) return;
  const name = answer.trim();
  if (!name) {
    $('#category-manager-error').textContent = 'El nombre de la categoría no puede estar vacío.';
    return;
  }
  if (state.manifest.categories.some(item => item !== category && item.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
    $('#category-manager-error').textContent = 'Ya existe una categoría con ese nombre.';
    return;
  }
  if (name === category) return;
  const categories = state.manifest.categories.map(item => item === category ? name : item);
  try { await saveCategories(categories, { renameCategory: category, newCategoryName: name }); }
  catch { /* The error is shown in the category manager. */ }
}
async function addCategory() {
  const input = $('#new-category-name');
  const name = input.value.trim();
  if (!name) {
    $('#category-manager-error').textContent = 'Escribe el nombre de la categoría.';
    input.focus();
    return;
  }
  if (state.manifest.categories.some(category => category.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
    $('#category-manager-error').textContent = 'Ya existe una categoría con ese nombre.';
    input.focus();
    return;
  }
  try {
    await saveCategories([...state.manifest.categories, name]);
    input.value = '';
  } catch { /* The error is shown in the category manager. */ }
}
async function deleteCategory(category) {
  const pages = state.manifest.pages.filter(page => page.category === category);
  let movePagesTo;
  if (pages.length) {
    const destinations = state.manifest.categories.filter(item => item !== category);
    if (!destinations.length) {
      $('#category-manager-error').textContent = 'Crea otra categoría antes de eliminar esta, para poder conservar sus páginas.';
      return;
    }
    const answer = window.prompt(`La categoría «${category}» tiene ${pages.length} página(s). Escribe el nombre de la categoría de destino para conservarlas:\n\n${destinations.join('\n')}`);
    if (answer === null) return;
    movePagesTo = destinations.find(item => item.toLocaleLowerCase('es') === answer.trim().toLocaleLowerCase('es'));
    if (!movePagesTo) {
      $('#category-manager-error').textContent = 'No se encontró esa categoría de destino. No se ha eliminado ninguna categoría ni página.';
      return;
    }
    if (!window.confirm(`Se moverán ${pages.length} página(s) de «${category}» a «${movePagesTo}». ¿Eliminar la categoría «${category}»?`)) return;
  } else if (!window.confirm(`¿Eliminar la categoría vacía «${category}»?`)) return;

  const categories = state.manifest.categories.filter(item => item !== category);
  try {
    await saveCategories(categories, { deleteCategory: category, ...(movePagesTo ? { movePagesTo } : {}) });
  } catch { /* The error is shown in the category manager. */ }
}
function refreshSession() {
  $('#login-button').textContent = state.token ? 'Cerrar sesión' : 'Acceder';
  $('#new-page').classList.toggle('hidden', !state.token);
  $('#manage-categories').classList.toggle('hidden', !state.token);
  $('#session-note').textContent = state.token ? 'Administrador conectado' : 'Modo lectura';
  $('#login-button').onclick = () => { if (!state.token) return $('#auth-dialog').showModal(); sessionStorage.removeItem('wiki-admin-token'); state.token = null; refreshSession(); loadPage(state.current.slug); };
}
function pageActions() { return state.token ? '<div class="edit-actions"><button class="edit-button" id="visual-edit">Editar</button><button class="edit-button" id="code-edit">Editar código</button></div>' : ''; }
async function loadPage(requestedSlug) {
  const page = state.manifest.pages.find(item => item.slug === requestedSlug) || state.manifest.pages.find(item => item.slug === 'inicio') || state.manifest.pages[0];
  if (!page) return;
  state.current = { ...page };
  document.querySelectorAll('.page-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${page.slug}`));
  $('#article').innerHTML = '<div class="loading">Cargando página…</div>';
  try { state.current.content = (await json(`${api}?slug=${encodeURIComponent(page.slug)}`)).content; }
  catch { state.current.content = await (await fetch(`content/${page.slug}.md`)).text(); }
  $('#article').innerHTML = `<div class="article-inner"><header class="article-header"><div><div class="article-category">${escapeHtml(page.category || 'General')}</div><h1>${escapeHtml(page.title)}</h1></div>${pageActions()}</header><div class="article-body">${markdown(bodyMarkdown(state.current.content))}</div><div class="page-history-actions"><button type="button" id="page-history-button">Historial</button></div></div>`;
  if (state.token) { const childButton = document.createElement('button'); childButton.className = 'edit-button'; childButton.textContent = 'Crear subpágina'; childButton.addEventListener('click', () => openEditor('visual', true, state.current.category, state.current.slug)); $('.edit-actions').prepend(childButton); }
  renderPageToc(); renderSectionEditLinks();
  renderTopPageLinks();
  $('#page-history-button').addEventListener('click', openPageHistory);
  $('#visual-edit')?.addEventListener('click', () => openEditor('visual', false));
  $('#code-edit')?.addEventListener('click', () => openEditor('code', false));
}
async function openPageHistory() {
  const page = state.current;
  if (!page) return;
  const dialog = $('#page-history-dialog');
  const list = $('#page-history-list');
  $('#page-history-title').textContent = `Historial de cambios: ${page.title}`;
  $('#page-history-description').textContent = 'Se guardan las versiones anteriores del contenido y del título.';
  $('#page-history-error').textContent = '';
  list.replaceChildren();
  const loading = document.createElement('li');
  loading.textContent = 'Cargando historial…';
  list.append(loading);
  dialog.showModal();
  try {
    const data = await json(`${api}?history=${encodeURIComponent(page.slug)}`);
    if (!Array.isArray(data.revisions) || data.revisions.some(revision =>
      !revision || typeof revision.timestamp !== 'string' || !Number.isFinite(Date.parse(revision.timestamp)) ||
      typeof revision.title !== 'string' || typeof revision.content !== 'string')) {
      throw new Error('El servidor devolvió un historial no válido.');
    }
    list.replaceChildren();
    const revisions = [...data.revisions].reverse();
    if (!revisions.length) {
      const empty = document.createElement('li');
      empty.textContent = 'Todavía no hay versiones anteriores guardadas.';
      list.append(empty);
      return;
    }
    revisions.forEach(revision => {
      const item = document.createElement('li');
      item.className = 'history-revision';
      const heading = document.createElement('strong');
      heading.textContent = revision.title || page.title;
      const time = document.createElement('time');
      time.dateTime = revision.timestamp;
      time.textContent = `Registrada en el historial el ${new Date(revision.timestamp).toLocaleString('es-ES')}`;
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Ver contenido de esta versión';
      const content = document.createElement('pre');
      content.textContent = revision.content;
      details.append(summary, content);
      item.append(heading, time, details);
      if (state.token) {
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'restore-page-revision';
        restore.textContent = 'Restaurar esta versión';
        restore.addEventListener('click', async () => {
          if (!window.confirm(`¿Restaurar el contenido y el título «${revision.title || page.title}»? La versión actual se guardará en el historial.`)) return;
          restore.disabled = true;
          try {
            const currentPage = state.manifest.pages.find(candidate => candidate.slug === page.slug);
            if (!currentPage) throw new Error('La página ya no existe.');
            const restoredTitle = revision.title || currentPage.title;
            const manifest = {
              ...state.manifest,
              pages: state.manifest.pages.map(candidate =>
                candidate.slug === page.slug ? { ...candidate, title: restoredTitle } : candidate
              )
            };
            await json(api, {
              method: 'PUT',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${state.token}` },
              body: JSON.stringify({ slug: page.slug, content: revision.content, manifest })
            });
            state.manifest = manifest;
            renderNavigation();
            dialog.close();
            location.hash = page.slug;
            await loadPage(page.slug);
          } catch (error) {
            $('#page-history-error').textContent = error.message;
            restore.disabled = false;
          }
        });
        item.append(restore);
      }
      list.append(item);
    });
  } catch (error) {
    list.replaceChildren();
    $('#page-history-error').textContent = error.status === 400 && ['localhost', '127.0.0.1'].includes(location.hostname)
      ? 'El servidor local todavía no reconoce el historial. Reinícialo para cargar los cambios.'
      : error.message;
  }
}
function editorPage(isNew, category) { return isNew ? { title:'', category:category || state.manifest.categories[0] || 'General', summary:'', content:'# Nueva página\n\nEscribe aquí.' } : state.current; }
function openEditor(type, isNew, presetCategory = '', presetParent = '') {
  if (!state.token) return; state.isNew = isNew; const page = editorPage(isNew, presetCategory); const prefix = type === 'code' ? 'code' : 'visual';
  $(`#${prefix}-editor-heading`).textContent = isNew ? 'Crear página' : type === 'code' ? 'Editar código' : 'Editar página';
  $(`#${prefix}-delete-page`).hidden = isNew;
  $(`#${prefix}-page-title`).value = page.title; $(`#${prefix}-page-category`).value = page.category; $(`#${prefix}-page-summary`).value = page.summary || '';
  $(`#${prefix}-page-hidden`).checked = Boolean(page.hidden);
  updateParentOptions(prefix, isNew ? presetParent : page.parent || '');
  updatePageOrder(prefix, page, isNew);
  if (type === 'code') { $('#code-page-content').value = page.content; updateCodePreview(); }
  else { $('#visual-page-content').innerHTML = markdown(bodyMarkdown(page.content)); $('#visual-page-content').querySelectorAll('table').forEach(makeTableResizable); setActiveEditorSurface($('#visual-page-content'), toolbar); }
  $(`#${prefix}-editor-error`).textContent = ''; $(`#${prefix}-editor-dialog`).showModal();
}
async function save(type) {
  const prefix = type === 'code' ? 'code' : 'visual'; const title = $(`#${prefix}-page-title`).value.trim(); const category = $(`#${prefix}-page-category`).value.trim();
  const slug = state.isNew ? slugify(title) : state.current.slug;
  if (!slug || !title || !category) throw new Error('Indica un título y una categoría.');
  const content = type === 'code' ? $('#code-page-content').value : `# ${title}\n\n${htmlToMarkdown($('#visual-page-content').innerHTML)}`;
  const parent = $(`#${prefix}-page-parent`).value;
  if (parent === slug) throw new Error('Una página no puede ser su propia página superior.');
  const orderInput = $(`#${prefix}-page-order`);
  const position = Number(orderInput.value);
  if (!Number.isInteger(position) || position < 1 || position > Number(orderInput.max)) {
    throw new Error(`Indica una posición entre 1 y ${orderInput.max}.`);
  }
  const page = { slug, title, category, summary: $(`#${prefix}-page-summary`).value.trim(), ...($(`#${prefix}-page-hidden`).checked ? { hidden: true } : {}), ...(parent ? { parent } : {}) };
  const pages = normalizePageOrders(state.manifest.pages.filter(item => item.slug !== slug), page, position);
  const manifest = { ...state.manifest, pages, categories: [...new Set([...state.manifest.categories, category])] };
  await json(api, { method:'PUT', headers:{'content-type':'application/json', authorization:`Bearer ${state.token}`}, body:JSON.stringify({ slug, content, manifest }) });
  state.manifest = manifest; renderNavigation(); $(`#${prefix}-editor-dialog`).close(); location.hash = slug; await loadPage(slug);
}
async function deletePage(type) {
  if (!state.token || state.isNew || !state.current) return;
  const page = state.current;
  const directChildren = state.manifest.pages.filter(item => item.parent === page.slug).length;
  const childNotice = directChildren ? ` Sus ${directChildren} subpágina(s) directa(s) se conservarán como páginas principales.` : '';
  if (!window.confirm(`¿Eliminar la página «${page.title}»? Esta acción no se puede deshacer.${childNotice}`)) return;
  const pages = state.manifest.pages
    .filter(item => item.slug !== page.slug)
    .map(item => {
      if (item.parent !== page.slug) return item;
      const promoted = { ...item };
      delete promoted.parent;
      return promoted;
    });
  if (!pages.length) throw new Error('No se puede eliminar la última página de la wiki.');
  const manifest = { ...state.manifest, pages: normalizePageOrders(pages) };
  await json(api, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${state.token}` },
    body: JSON.stringify({ slug: page.slug, manifest })
  });
  state.manifest = manifest;
  renderNavigation();
  $(`#${type}-editor-dialog`).close();
  const destination = pages.find(item => item.slug === 'inicio')?.slug || pages[0].slug;
  location.hash = destination;
  await loadPage(destination);
}

$('#login-form').addEventListener('submit', async event => { event.preventDefault(); try { const data = await json('/api/auth', {method:'POST', body:JSON.stringify({username:$('#username').value, password:$('#password').value})}); state.token = data.token; sessionStorage.setItem('wiki-admin-token', data.token); $('#auth-dialog').close(); event.target.reset(); refreshSession(); loadPage(state.current.slug); } catch (error) { $('#login-error').textContent = error.message; } });
$('#new-page').addEventListener('click', () => openEditor('visual', true));
$('#manage-categories').addEventListener('click', () => { $('#category-manager-error').textContent = ''; renderCategoryManager(); $('#category-manager-dialog').showModal(); });
$('#add-category').addEventListener('click', addCategory);
$('#category-manager-form').addEventListener('submit', event => { event.preventDefault(); addCategory(); });
window.openWikiEditor = (category = '') => openEditor('visual', true, category);
$('#code-editor-form').addEventListener('submit', async event => { event.preventDefault(); try { await save('code'); } catch (error) { $('#code-editor-error').textContent = error.message; } });
$('#visual-editor-form').addEventListener('submit', async event => { event.preventDefault(); try { await save('visual'); } catch (error) { $('#visual-editor-error').textContent = error.message; } });
$('#code-delete-page').addEventListener('click', async () => { try { await deletePage('code'); } catch (error) { $('#code-editor-error').textContent = error.message; } });
$('#visual-delete-page').addEventListener('click', async () => { try { await deletePage('visual'); } catch (error) { $('#visual-editor-error').textContent = error.message; } });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
document.querySelectorAll('.editor-toolbar button').forEach(button => button.addEventListener('click', () => { $('#visual-page-content').focus(); if (button.dataset.command === 'link') { const url = prompt('Dirección del enlace (para una página de la wiki, usa #slug):'); if (url) document.execCommand('createLink', false, url); } else if (button.dataset.block) document.execCommand('formatBlock', false, button.dataset.block); else document.execCommand(button.dataset.command, false); }));
function updateCodePreview() { $('#code-preview').innerHTML = markdown(bodyMarkdown($('#code-page-content').value)); }
$('#code-page-content').addEventListener('input', updateCodePreview);
document.querySelectorAll('.font-choice').forEach(button => button.addEventListener('click', () => { document.body.classList.toggle('font-large', button.dataset.size === 'large'); document.querySelectorAll('.font-choice').forEach(item => item.classList.toggle('active', item === button)); }));
function setTheme(theme) { document.body.classList.toggle('dark', theme === 'dark'); localStorage.setItem('wiki-theme', theme); document.querySelectorAll('.theme-choice').forEach(button => button.classList.toggle('active', button.dataset.theme === theme)); }
document.querySelectorAll('.theme-choice').forEach(button => button.addEventListener('click', () => setTheme(button.dataset.theme)));
setTheme(localStorage.getItem('wiki-theme') || 'light');
function setAppearanceChoice(selector, datasetKey, value, storageKey, attribute) {
  const choices = [...document.querySelectorAll(selector)];
  const selected = choices.find(button => button.dataset[datasetKey] === value) || choices.find(button => button.classList.contains('active'));
  if (!selected) return;
  document.body.dataset[attribute] = selected.dataset[datasetKey];
  choices.forEach(button => {
    const active = button === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (value === selected.dataset[datasetKey]) localStorage.setItem(storageKey, selected.dataset[datasetKey]);
}
document.querySelectorAll('.width-choice').forEach(button => button.addEventListener('click', () => setAppearanceChoice('.width-choice', 'width', button.dataset.width, 'wiki-reading-width', 'readingWidth')));
document.querySelectorAll('.spacing-choice').forEach(button => button.addEventListener('click', () => setAppearanceChoice('.spacing-choice', 'spacing', button.dataset.spacing, 'wiki-line-spacing', 'lineSpacing')));
document.querySelectorAll('.accent-choice').forEach(button => button.addEventListener('click', () => setAppearanceChoice('.accent-choice', 'accent', button.dataset.accent, 'wiki-accent-color', 'accentColor')));
setAppearanceChoice('.width-choice', 'width', localStorage.getItem('wiki-reading-width'), 'wiki-reading-width', 'readingWidth');
setAppearanceChoice('.spacing-choice', 'spacing', localStorage.getItem('wiki-line-spacing'), 'wiki-line-spacing', 'lineSpacing');
setAppearanceChoice('.accent-choice', 'accent', localStorage.getItem('wiki-accent-color'), 'wiki-accent-color', 'accentColor');
document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); location.hash = 'inicio'; loadPage('inicio'); });
document.querySelectorAll('.site-links a').forEach(link => link.addEventListener('click', event => { event.preventDefault(); const slug = link.getAttribute('href').slice(1); location.hash = slug; loadPage(slug); }));
$('#search-form').addEventListener('submit', event => { event.preventDefault(); const query = $('#search-input').value.trim().toLowerCase(); const page = state.manifest.pages.find(item => item.title.toLowerCase().includes(query)); if (page) { location.hash = page.slug; loadPage(page.slug); } });
$('#article').addEventListener('click', event => {
  const link = event.target.closest('.article-body a[href^="#"]');
  if (!link) return;
  const slug = link.getAttribute('href').slice(1);
  if (!state.manifest.pages.some(page => page.slug === slug)) return;
  event.preventDefault();
  location.hash = slug;
  loadPage(slug);
});
async function init() { const base = await json('content/manifest.json'); state.manifest = base; try { const remote = (await json(`${api}?type=manifest`)).manifest; if (remote.pages?.length) state.manifest = { ...base, pages:remote.pages, categories:Array.isArray(remote.categories) ? remote.categories : base.categories, hiddenCategories:Array.isArray(remote.hiddenCategories) ? remote.hiddenCategories : [] }; } catch {} renderNavigation(); refreshSession(); loadPage(location.hash.slice(1) || 'inicio'); }
// Markdown enriquecido: tablas, imágenes, enlaces y listas numeradas.
function inlineMarkdown(source = '') {
  return source
    .replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, text, href) => href.startsWith('#') ? `<a href="${href}">${text}</a>` : `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`)
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
    const widthLine = lines[index].match(/^:::anchos\s+(.+)$/i); if (widthLine) { pendingWidths = widthLine[1].split(',').map(width => { const value = width.trim(); return /^\d+(?:\.\d+)?%$/.test(value) ? value : ''; }); index++; continue; }
    if (isTable(index)) { const tableLines = [lines[index], lines[index + 1]]; index += 2; while (index < lines.length && /^\s*\|?.+\|.+\|?\s*$/.test(lines[index])) tableLines.push(lines[index++]); output += markdownTable(tableLines, pendingWidths); pendingWidths = []; continue; }
    const heading = lines[index].match(/^(#{1,6})\s+(.*)$/);
    if (heading) { const level = heading[1].length; output += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`; index++; continue; }
    if (/^>\s?/.test(lines[index])) { const quote = []; while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, '')); output += `<blockquote>${inlineMarkdown(quote.join('<br>'))}</blockquote>`; continue; }
    if (/^[-*]\s+/.test(lines[index]) || /^\d+\.\s+/.test(lines[index])) { const ordered = /^\d+\.\s+/.test(lines[index]); const pattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/; const items = []; while (index < lines.length && pattern.test(lines[index])) items.push(`<li>${inlineMarkdown(lines[index++].replace(pattern, ''))}</li>`); output += `<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`; continue; }
    const paragraph = []; while (index < lines.length && lines[index].trim() && !isTable(index) && !/^(#{1,6})\s+|^>\s?|^[-*]\s+|^\d+\.\s+/.test(lines[index])) paragraph.push(lines[index++]); output += `<p>${inlineMarkdown(paragraph.join('<br>'))}</p>`;
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
    if (tag === 'table') { const widths = [...node.querySelectorAll(':scope > thead th')].map(cell => cell.style.width); return `${widths.some(Boolean) ? `:::anchos ${widths.join(', ')}\n` : ''}${content}`; }
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
let activeEditorRoot = null;
let activeEditorToolbar = null;
let activeEditorTable = null;
let activeEditorCell = null;
function setActiveEditorSurface(root, tableToolbar) {
  activeEditorRoot = root;
  activeEditorToolbar = tableToolbar;
  setActiveEditorCell(null);
}
function setActiveEditorCell(cell) {
  const table = cell?.closest('table') || null;
  activeEditorTable = table && activeEditorRoot?.contains(table) ? table : null;
  activeEditorCell = activeEditorTable && cell && activeEditorTable.contains(cell) ? cell : null;
  activeEditorRoot?.querySelectorAll('table.table-active').forEach(item => item.classList.remove('table-active'));
  activeEditorTable?.classList.add('table-active');
  activeEditorToolbar?.querySelectorAll('[data-table-action]').forEach(button => { button.disabled = !activeEditorTable; });
  const removeRow = activeEditorToolbar?.querySelector('[data-table-action="remove-row"]');
  if (removeRow) removeRow.disabled = !activeEditorTable || !activeEditorCell || !activeEditorCell.closest('tbody tr');
  const removeColumn = activeEditorToolbar?.querySelector('[data-table-action="remove-column"]');
  if (removeColumn) removeColumn.disabled = !activeEditorTable || activeEditorTable.querySelector('thead tr')?.cells.length <= 1;
}
function refreshTableResizers(table) {
  table.querySelectorAll('.table-resize-handle').forEach(handle => handle.remove());
  delete table.dataset.resizable;
  makeTableResizable(table);
}
function focusTableCell(cell) {
  activeEditorRoot?.focus();
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  setActiveEditorCell(cell);
}
function changeTableStructure(action) {
  const table = activeEditorTable;
  if (!table || !activeEditorRoot?.contains(table)) {
    setActiveEditorCell(null);
    return;
  }
  const headerRow = table.tHead?.rows[0];
  const columnCount = headerRow?.cells.length || 0;
  const cell = activeEditorCell && table.contains(activeEditorCell) ? activeEditorCell : headerRow?.cells[0];
  const columnIndex = cell?.cellIndex ?? 0;
  if (action === 'add-row') {
    const body = table.tBodies[0] || table.createTBody();
    const selectedRow = cell?.closest('tbody tr');
    const row = body.insertRow(selectedRow ? [...body.rows].indexOf(selectedRow) + 1 : 0);
    for (let index = 0; index < columnCount; index++) row.insertCell().textContent = 'Escribe aquí';
    focusTableCell(row.cells[Math.min(columnIndex, row.cells.length - 1)]);
  } else if (action === 'remove-row') {
    const row = activeEditorCell?.closest('tbody tr');
    if (!row) return;
    const nextRow = row.nextElementSibling || row.previousElementSibling;
    const nextCell = nextRow?.cells[Math.min(columnIndex, nextRow.cells.length - 1)];
    row.remove();
    setActiveEditorCell(nextCell || headerRow?.cells[Math.min(columnIndex, columnCount - 1)] || null);
    if (nextCell) focusTableCell(nextCell);
  } else if (action === 'add-column') {
    if (!headerRow) return;
    const insertIndex = columnIndex + 1;
    [...table.rows].forEach(row => {
      const newCell = document.createElement(row.parentElement === table.tHead ? 'th' : 'td');
      newCell.textContent = row.parentElement === table.tHead ? 'Nueva columna' : 'Escribe aquí';
      row.insertBefore(newCell, row.cells[insertIndex] || null);
    });
    refreshTableResizers(table);
    focusTableCell(headerRow.cells[insertIndex]);
  } else if (action === 'remove-column') {
    if (columnCount <= 1) return;
    const selectedRow = cell?.closest('tr');
    [...table.rows].forEach(row => row.cells[columnIndex]?.remove());
    refreshTableResizers(table);
    const nextCell = selectedRow?.cells[Math.min(columnIndex, selectedRow.cells.length - 1)] || headerRow.cells[Math.min(columnIndex, headerRow.cells.length - 1)];
    focusTableCell(nextCell);
  }
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
  const tables = $('#visual-page-content').querySelectorAll('table');
  const table = tables[tables.length - 1];
  setActiveEditorCell(table?.tBodies[0]?.rows[0]?.cells[0] || table?.tHead.rows[0].cells[0] || null);
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
function updatePageOrder(prefix, page, isNew) {
  const form = $(`#${prefix}-editor-form`);
  let label = form.querySelector(`label[for="${prefix}-page-order"]`);
  if (!label) {
    label = document.createElement('label');
    label.htmlFor = `${prefix}-page-order`;
    label.textContent = 'Posición en la categoría (1 = primera)';
    const input = document.createElement('input');
    input.id = `${prefix}-page-order`;
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.required = true;
    label.append(input);
    form.querySelector(`label[for="${prefix}-page-parent"]`).insertAdjacentElement('afterend', label);
    input.addEventListener('change', () => {
      const maximum = Number(input.max);
      if (Number(input.value) > maximum) input.value = String(maximum);
    });
    form.querySelector(`#${prefix}-page-category`).addEventListener('change', () => refreshPageOrder(prefix));
    form.querySelector(`#${prefix}-page-parent`).addEventListener('change', () => refreshPageOrder(prefix));
  }
  const input = label.querySelector('input');
  const groupKey = pageOrderGroupKey(page);
  const siblings = state.manifest.pages.filter(item => item.slug !== (isNew ? '' : page.slug) && pageOrderGroupKey(item) === groupKey);
  input.max = String(siblings.length + 1);
  input.value = String(isNew ? siblings.length + 1 : pageOrderInGroup(page));
  label.firstChild.nodeValue = page.parent ? 'Posición entre subpáginas (1 = primera)' : 'Posición en la categoría (1 = primera)';
}
function refreshPageOrder(prefix) {
  const input = $(`#${prefix}-page-order`);
  const category = $(`#${prefix}-page-category`).value.trim();
  const parent = $(`#${prefix}-page-parent`).value;
  const label = input.parentElement;
  label.firstChild.nodeValue = parent ? 'Posición entre subpáginas (1 = primera)' : 'Posición en la categoría (1 = primera)';
  const currentSlug = state.isNew ? '' : state.current.slug;
  const currentGroup = pageOrderGroupKey({ category, parent });
  const siblings = state.manifest.pages.filter(page => page.slug !== currentSlug && pageOrderGroupKey(page) === currentGroup);
  const maximum = siblings.length + 1;
  input.max = String(maximum);
  input.value = String(maximum);
}
const subpageStyle = document.createElement('style');
subpageStyle.textContent = '.subpages{margin-left:13px;padding-left:8px;border-left:1px solid var(--line)}.subpages .page-link{font-size:.86rem}#code-page-parent,#visual-page-parent{display:block;width:100%;margin-top:5px;padding:9px 10px;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:6px}.sidebar-head>div{display:flex;gap:4px;flex-shrink:0}.category-manager-dialog{width:min(620px,calc(100% - 32px))}.category-manager-dialog form{padding:26px 30px}.category-manager-dialog #add-category{margin-top:10px}.category-manager-dialog #category-manager-list{display:grid;gap:7px;padding-left:28px;margin:18px 0 0;list-style:decimal}.category-manager-item{display:flex;align-items:center;gap:7px;padding:7px 8px;border:1px solid var(--line);border-radius:5px;background:var(--surface);cursor:grab}.category-manager-item:active{cursor:grabbing}.category-manager-item.category-hidden{opacity:.65}.category-manager-item.category-dragging{opacity:.45}.category-manager-item.drop-before{box-shadow:0 -3px 0 var(--accent)}.category-manager-item.drop-after{box-shadow:0 3px 0 var(--accent)}.category-manager-name{margin-right:auto}.category-manager-name:before{content:\"⠿\";color:var(--muted);margin-right:9px;cursor:grab}.category-manager-item .delete-category,.category-manager-item .rename-category,.category-manager-item .toggle-category-visibility{flex-shrink:0;padding:4px 8px;background:var(--accent-soft);color:var(--accent);font-size:.8rem;font-weight:650}.category-manager-item button:disabled{opacity:.45;cursor:not-allowed}.visibility-setting{display:flex;align-items:center;gap:8px}.visibility-setting input{display:inline-block;width:auto;margin:0}.category-manager-dialog .error{margin:12px 0 0}';
document.head.append(subpageStyle);
const sectionEditorStyle = document.createElement('style');
sectionEditorStyle.textContent = '.page-edit-links{display:flex;gap:10px;align-items:center;font-size:.85rem}.page-edit-links a,.section-edit{color:var(--accent);text-decoration:none}.page-edit-links a:hover,.section-edit:hover{text-decoration:underline}.section-edit{font:normal .72rem system-ui,-apple-system,sans-serif;white-space:nowrap}.section-editor-dialog{width:min(850px,calc(100% - 28px));max-height:calc(100vh - 28px);border:1px solid var(--line);border-radius:5px;background:var(--surface);color:var(--text);box-shadow:0 18px 60px #0006}.section-editor-dialog form{padding:28px;max-height:calc(100vh - 28px);overflow:auto;position:relative}.section-editor-dialog header{padding-right:32px;border-bottom:1px solid var(--line);margin-bottom:14px}.section-editor-dialog header h2{margin:0;font:25px Georgia,serif}.section-editor-dialog header p{margin:3px 0 12px;color:var(--muted)}.section-editor-toolbar{display:flex;gap:4px;padding:7px;border:1px solid var(--line);border-bottom:0;background:var(--code)}.section-editor-toolbar button{border:1px solid transparent;background:transparent;color:var(--text);padding:4px 9px}.section-editor-toolbar button:hover{border-color:var(--line);background:var(--surface)}.section-editor-toolbar .table-edit-actions{display:inline-flex;gap:4px;padding-left:7px;border-left:1px solid var(--line)}.section-editor-toolbar [data-table-action]:disabled{opacity:.45;cursor:not-allowed}.section-editor-content{min-height:300px;padding:18px 21px;border:1px solid var(--line);background:#fff;color:#202122;outline:0}.section-editor-content:focus{box-shadow:inset 0 0 0 2px #36c}.section-editor-content table{table-layout:fixed}.section-editor-content th{position:relative}.section-editor-content table.table-active{outline:2px solid #36c;outline-offset:2px}@media(max-width:700px){.page-edit-links{gap:6px;font-size:.76rem}.topbar{height:auto;min-height:64px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}.section-editor-dialog form{padding:22px 18px}}';
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
tocStyle.textContent = '.page-toc{margin:22px 0 28px;padding:13px 16px;border:1px solid var(--line);border-radius:4px;background:var(--bg);max-width:520px}.page-toc strong{display:block;margin-bottom:5px}.page-toc-list{margin:0;padding-left:22px}.page-toc-list-nested{margin:0;padding-left:24px}.page-toc-list li{margin:2px 0}.page-toc-list button{display:inline-block;padding:1px 3px;border:0;border-radius:0;background:transparent;color:var(--accent);font:inherit;text-align:left}.page-toc-list button:hover{text-decoration:underline}.page-toc-level-2>button{padding-left:3px}.page-toc-level-3>button{padding-left:19px}.page-toc-level-4>button{padding-left:35px}.page-toc-level-5>button{padding-left:51px}.page-toc-level-6>button{padding-left:67px}';
document.head.append(tocStyle);
const tableResizeStyle = document.createElement('style');
tableResizeStyle.textContent = '.visual-content table,.section-editor-content table{table-layout:fixed}.visual-content th,.section-editor-content th{position:relative}.table-resize-handle{position:absolute;z-index:2;top:0;right:-5px;width:10px;height:100%;cursor:col-resize;user-select:none}.table-resize-handle:hover,.table-resize-handle:active{background:#36c5}';
document.head.append(tableResizeStyle);
const richEditorStyle = document.createElement('style');
richEditorStyle.textContent = '.editor-toolbar{flex-wrap:wrap}.editor-toolbar button[data-rich-command]{font-weight:650}.editor-toolbar .table-edit-actions{display:inline-flex;gap:4px;padding-left:7px;border-left:1px solid var(--line)}.editor-toolbar [data-table-action]:disabled{opacity:.45;cursor:not-allowed}.visual-content table.table-active{outline:2px solid #36c;outline-offset:2px}.visual-content .table-wrap,.article-body .table-wrap{overflow-x:auto;margin:1em 0}.visual-content table,.article-body table{border-collapse:collapse;width:100%;min-width:360px}.visual-content th,.visual-content td,.article-body th,.article-body td{border:1px solid #a2a9b1;padding:7px 10px;text-align:left;vertical-align:top}.visual-content th,.article-body th{background:#eaecf0;font-weight:700}.visual-content td{min-width:90px}.visual-content img,.article-body img{display:block;max-width:100%;height:auto;margin:1em 0}.article-body tr:nth-child(even) td{background:var(--bg)}.visual-content details,.article-body details{margin:1em 0;border:1px solid var(--line);border-radius:4px;background:var(--surface)}.visual-content summary,.article-body summary{cursor:pointer;padding:9px 12px;font-weight:700;color:var(--accent)}.visual-content .details-content,.article-body .details-content{padding:0 12px 10px;border-top:1px solid var(--line)}';
document.head.append(richEditorStyle);
const toolbar = $('.editor-toolbar');
toolbar.insertAdjacentHTML('beforeend', '<button type="button" data-rich-command="table" title="Insertar tabla">Tabla</button><button type="button" data-rich-command="image" title="Insertar imagen">Imagen</button><button type="button" data-rich-command="details" title="Insertar desplegable">Desplegable</button>');
toolbar.querySelectorAll('[data-rich-command]').forEach(button => button.addEventListener('click', () => { if (button.dataset.richCommand === 'table') insertTable(); else if (button.dataset.richCommand === 'image') insertImage(); else insertDetails(); }));
toolbar.insertAdjacentHTML('beforeend', '<span class="table-edit-actions" aria-label="Edición de tabla"><button type="button" data-table-action="add-row" disabled title="Añadir una fila debajo de la seleccionada">+ Fila</button><button type="button" data-table-action="remove-row" disabled title="Eliminar la fila de contenido seleccionada">− Fila</button><button type="button" data-table-action="add-column" disabled title="Añadir una columna a la derecha de la seleccionada">+ Columna</button><button type="button" data-table-action="remove-column" disabled title="Eliminar la columna seleccionada">− Columna</button></span>');
toolbar.querySelectorAll('[data-table-action]').forEach(button => {
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => changeTableStructure(button.dataset.tableAction));
});
setActiveEditorSurface($('#visual-page-content'), toolbar);
$('#visual-page-content').addEventListener('click', event => setActiveEditorCell(event.target.closest('td, th')));
$('#visual-page-content').addEventListener('keyup', () => {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  const cell = node?.nodeType === Node.ELEMENT_NODE ? node.closest('td, th') : node?.parentElement?.closest('td, th');
  if (cell) setActiveEditorCell(cell);
});
function renderPageToc() {
  const article = $('.article-inner'); const headings = [...article.querySelectorAll('.article-body h2, .article-body h3, .article-body h4, .article-body h5, .article-body h6')].filter(heading => heading.closest('.table-wrap') === null); if (!headings.length) return;
  const usedIds = new Set(); const list = document.createElement('ol'); list.className = 'page-toc-list';
  const parents = [];
  headings.forEach(heading => {
    const base = slugify(heading.textContent) || 'seccion'; let id = base; let number = 2; while (usedIds.has(id)) id = `${base}-${number++}`; usedIds.add(id); heading.id = id;
    const level = Number(heading.tagName.slice(1));
    while (parents.length && parents[parents.length - 1].level >= level) parents.pop();
    let parentList = list;
    if (parents.length) {
      const parentItem = parents[parents.length - 1].item;
      parentList = parentItem.querySelector(':scope > ol');
      if (!parentList) {
        parentList = document.createElement('ol');
        parentList.className = 'page-toc-list page-toc-list-nested';
        parentItem.append(parentList);
      }
    }
    const item = document.createElement('li');
    item.className = `page-toc-level-${level}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = heading.textContent;
    button.addEventListener('click', () => heading.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    item.append(button);
    parentList.append(item);
    parents.push({ level, item });
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
  while (current) { if (/^H[2-6]$/.test(current.tagName) && Number(current.tagName.slice(1)) <= level) break; nodes.push(current); current = current.nextElementSibling; }
  return nodes;
}
function renderSectionEditLinks() {
  if (!state.token) return;
  document.querySelectorAll('.article-body h2, .article-body h3, .article-body h4, .article-body h5, .article-body h6').forEach(heading => {
    const link = document.createElement('a'); link.href = '#'; link.className = 'section-edit'; link.textContent = 'editar'; link.setAttribute('aria-label', `Editar sección ${heading.textContent}`); link.addEventListener('click', event => { event.preventDefault(); openSectionEditor(heading); }); heading.append(' ', link);
  });
}
function openSectionEditor(heading) {
  const originalNodes = getSectionNodes(heading); const section = document.createElement('div'); originalNodes.forEach(node => section.append(node.cloneNode(true))); section.querySelectorAll('.section-edit').forEach(link => link.remove());
  const dialog = document.createElement('dialog'); dialog.className = 'section-editor-dialog'; dialog.innerHTML = `<form method="dialog"><button type="button" class="close" aria-label="Cerrar">×</button><header><h2>Editar sección</h2><p>Los cambios se aplicarán solo a esta sección.</p></header><div class="section-editor-toolbar"><button type="button" data-command="bold"><b>B</b></button><button type="button" data-command="italic"><i>I</i></button><button type="button" data-command="insertUnorderedList">Lista</button><button type="button" data-command="link">Enlace</button><span class="table-edit-actions" aria-label="Edición de tabla"><button type="button" data-table-action="add-row" disabled title="Añadir una fila debajo de la seleccionada">+ Fila</button><button type="button" data-table-action="remove-row" disabled title="Eliminar la fila de contenido seleccionada">− Fila</button><button type="button" data-table-action="add-column" disabled title="Añadir una columna a la derecha de la seleccionada">+ Columna</button><button type="button" data-table-action="remove-column" disabled title="Eliminar la columna seleccionada">− Columna</button></span></div><div class="section-editor-content" contenteditable="true" spellcheck="true"></div><p class="error"></p><div class="editor-actions"><button type="button" class="secondary" data-cancel>Cancelar</button><button class="primary" value="save">Guardar sección</button></div></form>`;
  const content = dialog.querySelector('.section-editor-content'); content.innerHTML = section.innerHTML; content.querySelectorAll('table').forEach(makeTableResizable); document.body.append(dialog); dialog.showModal();
  setActiveEditorSurface(content, dialog.querySelector('.section-editor-toolbar'));
  const close = () => { dialog.close(); dialog.remove(); setActiveEditorSurface(null, null); }; dialog.querySelector('.close').addEventListener('click', close); dialog.querySelector('[data-cancel]').addEventListener('click', close);
  dialog.querySelectorAll('[data-command]').forEach(button => { button.addEventListener('mousedown', event => event.preventDefault()); button.addEventListener('click', () => { content.focus(); if (button.dataset.command === 'link') { const url = prompt('Dirección del enlace (para una página de la wiki, usa #slug):'); if (url) document.execCommand('createLink', false, url); } else document.execCommand(button.dataset.command, false); }); });
  dialog.querySelectorAll('[data-table-action]').forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => changeTableStructure(button.dataset.tableAction));
  });
  content.addEventListener('click', event => setActiveEditorCell(event.target.closest('td, th')));
  content.addEventListener('keyup', () => {
    const node = window.getSelection()?.anchorNode;
    const cell = node?.nodeType === Node.ELEMENT_NODE ? node.closest('td, th') : node?.parentElement?.closest('td, th');
    if (cell) setActiveEditorCell(cell);
  });
  dialog.querySelector('form').addEventListener('submit', async event => { event.preventDefault(); try {
    const replacement = [...content.children].map(node => node.cloneNode(true)); originalNodes.slice(1).forEach(node => node.remove()); originalNodes[0].replaceWith(...replacement);
    const cleanBody = $('.article-body').cloneNode(true); cleanBody.querySelectorAll('.section-edit').forEach(link => link.remove()); const updatedContent = `# ${state.current.title}\n\n${htmlToMarkdown(cleanBody.innerHTML)}`;
    await json(api, { method:'PUT', headers:{'content-type':'application/json', authorization:`Bearer ${state.token}`}, body:JSON.stringify({ slug:state.current.slug, content:updatedContent, manifest:state.manifest }) }); state.current.content = updatedContent; close(); await loadPage(state.current.slug);
  } catch (error) { dialog.querySelector('.error').textContent = error.message; } });
}
init();
