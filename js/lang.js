/* ===========================================================================
   lang.js — the Arabic switch.

   Pressing AR turns the page Arabic in place: the document flips to RTL and
   every marked string swaps to its Arabic text. Pressing it again returns to
   English. There is no second set of pages, which is deliberate — a separate
   /ar/ build would double every future edit, and until it existed the link
   pointed at a 404.

   What gets translated is marked in the markup, not listed here:
     data-ar        swap this element's text
     data-ar-html   swap its markup (used where a line break is part of it)
   So adding a string is an edit to the HTML, and this file never needs to know
   what the site says.

   The choice is remembered, so it survives a reload.
   =========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'ajid-lang';
  var root = document.documentElement;

  function nodes() {
    return [].slice.call(document.querySelectorAll('[data-ar],[data-ar-html]'));
  }

  /* Keep the English on first use, so switching back is exact rather than a
     translation of a translation. */
  function remember(el) {
    if (el.dataset.en === undefined) {
      el.dataset.en = el.dataset.arHtml !== undefined ? el.innerHTML : el.textContent;
    }
  }

  function apply(lang) {
    var ar = lang === 'ar';

    root.setAttribute('lang', ar ? 'ar' : 'en');
    root.setAttribute('dir', ar ? 'rtl' : 'ltr');
    root.classList.toggle('is-ar', ar);

    nodes().forEach(function (el) {
      if (el.classList.contains('js-lang')) return;      // the switch itself
      remember(el);
      if (el.dataset.arHtml !== undefined) {
        el.innerHTML = ar ? el.dataset.arHtml : el.dataset.en;
      } else {
        el.textContent = ar ? el.dataset.ar : el.dataset.en;
      }
    });

    /* The switch names the language it takes you TO, so it reads AR while you
       are in English and EN once you are in Arabic. */
    [].slice.call(document.querySelectorAll('.js-lang')).forEach(function (a) {
      a.textContent = ar ? a.dataset.arLabel : a.dataset.en;
      a.setAttribute('aria-label', ar ? 'Switch to English' : 'Switch to Arabic');
      a.setAttribute('lang', ar ? 'en' : 'ar');
    });

    try { localStorage.setItem(KEY, lang); } catch (e) {}
  }

  function current() {
    try { return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en'; }
    catch (e) { return 'en'; }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.js-lang');
    if (!a) return;
    e.preventDefault();
    apply(current() === 'ar' ? 'en' : 'ar');
  });

  apply(current());
  global.__lang = { apply: apply, current: current };
})(window);
