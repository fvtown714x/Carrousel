(function () {
  function renderEmpty(root, message) {
    root.innerHTML = '<div class="carrousel-block__empty"><p>' + message + '</p></div>';
  }

  function renderItems(root, items, heading) {
    var viewportId = 'carrousel-viewport-' + root.dataset.blockId;
    var cards = items.map(function (item) {
      var media = item.type === 'VIDEO'
        ? '<video class="carrousel-block__media" muted playsinline preload="metadata" src="' + (item.url || '') + '" poster="' + (item.thumbnail || '') + '"></video>'
        : '<img class="carrousel-block__media" loading="lazy" src="' + (item.thumbnail || item.url || '') + '" alt="' + item.title + '">';

      return (
        '<article class="carrousel-block__card">' +
          media +
          '<div class="carrousel-block__content">' +
            '<span class="carrousel-block__label">' + item.type + '</span>' +
            '<p class="carrousel-block__name">' + item.title + '</p>' +
          '</div>' +
        '</article>'
      );
    }).join('');

    root.innerHTML =
      '<div class="carrousel-block__header">' +
        '<h3 class="carrousel-block__title">' + heading + '</h3>' +
        '<div class="carrousel-block__controls">' +
          '<button type="button" class="carrousel-block__control" data-direction="prev" aria-label="Previous">&#8592;</button>' +
          '<button type="button" class="carrousel-block__control" data-direction="next" aria-label="Next">&#8594;</button>' +
        '</div>' +
      '</div>' +
      '<div class="carrousel-block__viewport" id="' + viewportId + '">' +
        '<div class="carrousel-block__track">' + cards + '</div>' +
      '</div>';

    var viewport = root.querySelector('.carrousel-block__viewport');
    root.querySelectorAll('.carrousel-block__control').forEach(function (button) {
      button.addEventListener('click', function () {
        var direction = button.dataset.direction === 'next' ? 1 : -1;
        viewport.scrollBy({ left: viewport.clientWidth * 0.9 * direction, behavior: 'smooth' });
      });
    });
  }

  async function hydrate(root) {
    if (!root || root.dataset.initialized === 'true') {
      return;
    }

    root.dataset.initialized = 'true';

    var endpoint = root.dataset.endpoint;
    var source = root.dataset.source || 'default';
    var playlist = root.dataset.playlist || '';
    var productId = root.dataset.productId || '';
    var limit = root.dataset.limit || '12';
    var heading = root.dataset.heading || 'Shop the carousel';
    var url = new URL(endpoint);

    url.searchParams.set('source', source);
    url.searchParams.set('limit', limit);
    if (playlist) {
      url.searchParams.set('playlist', playlist);
    }
    if (productId) {
      url.searchParams.set('productId', productId);
    }

    try {
      var response = await fetch(url.toString(), { credentials: 'same-origin' });
      var payload = null;

      try {
        payload = await response.json();
      } catch (parseError) {
        console.error('[carrousel-block] invalid proxy response', parseError, response.status, response.url);
        renderEmpty(
          root,
          window.Shopify && Shopify.designMode
            ? 'The app proxy did not return JSON. Reinstall or reopen the app after approving scopes.'
            : 'Unable to load carousel content right now.'
        );
        return;
      }

      if (!response.ok || !payload.items || payload.items.length === 0) {
        console.warn('[carrousel-block] empty or failed response', {
          status: response.status,
          payload: payload,
          url: url.toString()
        });
        renderEmpty(root, window.Shopify && Shopify.designMode
          ? (payload && payload.error ? payload.error : 'No media matched the current Theme Editor settings yet.')
          : 'No media is available for this carousel.');
        return;
      }

      renderItems(root, payload.items, heading);
    } catch (error) {
      console.error('[carrousel-block] failed to load items', error);
      renderEmpty(root, 'Unable to load carousel content right now.');
    }
  }

  function init() {
    document.querySelectorAll('[data-carrousel-block]').forEach(hydrate);
  }

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('shopify:section:load', init);
  document.addEventListener('shopify:block:select', init);
})();