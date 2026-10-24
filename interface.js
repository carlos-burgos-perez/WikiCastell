// Detalles de navegación de la interfaz enciclopédica.
(() => {
  const form = document.querySelector('#search-form');
  const input = document.querySelector('#search-input');
  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = input.value.trim().toLocaleLowerCase();
    if (!query) return;
    const links = [...document.querySelectorAll('#navigation .page-link')];
    const match = links.find(link => link.textContent.toLocaleLowerCase().includes(query));
    if (match) { match.click(); input.value = ''; }
    else { input.setCustomValidity('No se encontró una página con ese título.'); input.reportValidity(); input.setCustomValidity(''); }
  });
  document.querySelectorAll('.font-choice').forEach(button => button.addEventListener('click', () => {
    document.body.classList.toggle('font-large', button.dataset.size === 'large');
    document.querySelectorAll('.font-choice').forEach(b => b.classList.toggle('active', b === button));
  }));
  const observer = new MutationObserver(() => {
    const header = document.querySelector('.article-header');
    if (header && !header.parentElement.querySelector('.page-tabs')) {
      const tabs = document.createElement('div');
      tabs.className = 'page-tabs'; tabs.innerHTML = '<span>Artículo</span><span>Discusión</span><span>Leer</span>';
      header.parentElement.insertBefore(tabs, header.nextSibling);
    }
    const article = document.querySelector('#article');
    const isHome = location.hash === '' || location.hash === '#inicio';
    if (article && isHome && !article.querySelector('.home-categories')) {
      const groups = [];
      let group = null;
      document.querySelectorAll('#navigation .category, #navigation .page-link').forEach(node => {
        if (node.classList.contains('category')) { group = { title: node.textContent, pages: [] }; groups.push(group); }
        else if (group && node.getAttribute('href') !== '#inicio') group.pages.push({ title: node.textContent, href: node.getAttribute('href') });
      });
      const section = document.createElement('section');
      section.className = 'home-categories';
      const others = groups.find(group => group.title === 'Otras páginas') || { pages: [] };
      const mainGroups = groups.filter(group => group.title !== 'Otras páginas' && group.pages.length);
      const addButton = sessionStorage.getItem('wiki-admin-token') ? '<button type="button" class="add-other-page" id="add-other-page">Añadir página</button>' : '';
      section.innerHTML = '<h2>Categorías</h2>' + mainGroups.map(group => `<section class="category-card"><h3>${group.title}</h3><ul>${group.pages.map(page => `<li><a href="${page.href}">${page.title}</a></li>`).join('')}</ul></section>`).join('') + `<div class="other-pages"><h2 class="other-pages-title">Otras páginas</h2><p class="other-pages-note">Aquí podrás añadir el resto de páginas cuando las vayas creando.</p><ul>${others.pages.map(page => `<li><a href="${page.href}">${page.title}</a></li>`).join('')}</ul>${addButton}</div>`;
      section.querySelectorAll('a').forEach(link => link.addEventListener('click', event => {
        event.preventDefault();
        const navigationLink = document.querySelector(`#navigation .page-link[href="${link.getAttribute('href')}"]`);
        if (navigationLink) navigationLink.click();
      }));
      section.querySelector('#add-other-page')?.addEventListener('click', () => window.openWikiEditor?.('Otras páginas'));
      const tabs = article.querySelector('.page-tabs');
      if (tabs) tabs.insertAdjacentElement('beforebegin', section);
    }
    const isIndex = location.hash === '#indice';
    if (article && isIndex && !article.querySelector('.all-pages-index')) {
      const groups = [];
      let group = null;
      document.querySelectorAll('#navigation .category, #navigation .page-link').forEach(node => {
        if (node.classList.contains('category')) { group = { title: node.textContent, pages: [] }; groups.push(group); }
        else if (group) group.pages.push({ title: node.textContent, href: node.getAttribute('href') });
      });
      const section = document.createElement('section');
      section.className = 'all-pages-index';
      section.innerHTML = groups.filter(group => group.pages.length).sort((a, b) => a.title.localeCompare(b.title, 'es')).map(group => `<section><h2>${group.title}</h2><ul>${group.pages.sort((a, b) => a.title.localeCompare(b.title, 'es')).map(page => `<li><a href="${page.href}">${page.title}</a></li>`).join('')}</ul></section>`).join('');
      section.querySelectorAll('a').forEach(link => link.addEventListener('click', event => {
        event.preventDefault(); const navigationLink = document.querySelector(`#navigation .page-link[href="${link.getAttribute('href')}"]`); if (navigationLink) navigationLink.click();
      }));
      const tabs = article.querySelector('.page-tabs');
      if (tabs) tabs.insertAdjacentElement('beforebegin', section);
    }
  });
  observer.observe(document.querySelector('#article'), {childList:true, subtree:true});
})();
