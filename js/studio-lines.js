/* ===========================================================================
   studio-lines.js — the About copy, split into its real lines.

   THE PROBLEM THIS SOLVES
   Page two's copy has to do two things that pull against each other:

     FILL     every full line runs the whole measure, so the block has the same
              space on its left and its right at any window width.
     CASCADE  each line enters on its own beat, a tenth of a second after the
              one above it, exactly as the Studio page's address does.

   Hard-coded line spans give the cascade but not the fill: the breaks are
   frozen where the layout was drawn, so at any other width the lines stop
   short of the right inset. Letting the paragraph wrap naturally gives the fill
   but not the cascade: there is nothing to hang a per-line delay on, because
   the lines are not elements.

   So the browser decides the breaks, and then we make them into elements. Each
   word is measured, words sharing a top edge are one line, and each line is
   wrapped in its own block span carrying its index. The breaks are the ones the
   browser chose, so they still fill; the spans are real, so they still cascade.

   Re-run on resize and after a language switch, because both change where the
   lines fall. Runs once fonts are ready: measuring against the fallback face
   would group the words by the wrong breaks.
   =========================================================================== */
(function (global) {
  'use strict';

  var copy = document.querySelector('.studio__copy');
  if (!copy) return;

  var paras = [].slice.call(copy.querySelectorAll('p'));
  if (!paras.length) return;

  /* The words, however the paragraph is currently built.

     A re-split has to read back what the last one wrote, and the lines it wrote
     are BLOCK spans - so there is no whitespace between them in the DOM and
     textContent runs the last word of one line straight into the first of the
     next: 'around' + 'individual' came back as 'aroundindividual', and the pair
     stayed welded together from then on. Reading the lines separately and
     joining them with a space puts the break back where the markup implies it.

     Before the first split, and after lang.js swaps the copy for its Arabic,
     there are no line spans and the paragraph's own text is the source. */
  function sourceText(p) {
    var lines = p.querySelectorAll('.studio__line');
    var text = lines.length
      ? [].map.call(lines, function (l) { return l.textContent; }).join(' ')
      : p.textContent;
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function split(p, startIndex) {
    var text = sourceText(p);
    if (!text) return startIndex;

    /* Lay every word out as its own inline box so each one can be measured.
       They are inline, so the browser breaks them exactly where it would have
       broken the running text. */
    var words = text.split(' ');
    var probes = [];
    p.textContent = '';
    words.forEach(function (w, i) {
      var span = document.createElement('span');
      span.textContent = w;
      p.appendChild(span);
      if (i < words.length - 1) p.appendChild(document.createTextNode(' '));
      probes.push(span);
    });

    /* Group by top edge. offsetTop is integral and identical for every word on
       a line, which is what makes this reliable where measuring x would not. */
    var lines = [], currentTop = null, current = null;
    probes.forEach(function (span, i) {
      var top = span.offsetTop;
      if (currentTop === null || top !== currentTop) {
        currentTop = top;
        current = [];
        lines.push(current);
      }
      current.push(words[i]);
    });

    /* Rebuild as one block span per line. The last line of a paragraph is
       marked so the stylesheet can leave it ragged: it is the end of the
       paragraph and stretching it would space the words apart. */
    p.textContent = '';
    lines.forEach(function (wordsOnLine, i) {
      var span = document.createElement('span');
      span.className = 'studio__line' +
        (i === lines.length - 1 ? ' studio__line--last' : '');
      span.style.setProperty('--i', startIndex + i);
      span.textContent = wordsOnLine.join(' ');
      p.appendChild(span);
    });

    return startIndex + lines.length;
  }

  function splitAll() {
    /* One running index across both paragraphs, so the beat carries on from the
       first into the second instead of restarting. */
    var n = 0;
    paras.forEach(function (p) { n = split(p, n); });
    copy.setAttribute('data-split', String(n));
  }

  /* Measuring before the web font arrives groups the words by the fallback's
     metrics, and the lines then jump when the real face swaps in. */
  function run() {
    if (global.document.fonts && document.fonts.ready) {
      document.fonts.ready.then(splitAll);
    } else {
      splitAll();
    }
  }

  run();

  /* Resize changes the measure, so the breaks move with it. Debounced: this
     rebuilds DOM, and a drag-resize fires continuously. */
  var t;
  addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(splitAll, 150);
  });

  /* lang.js swaps the copy for its Arabic and back, which replaces everything
     this built. Re-split whenever the document's language attribute changes. */
  if (global.MutationObserver) {
    new MutationObserver(function () {
      clearTimeout(t);
      t = setTimeout(splitAll, 0);
    }).observe(document.documentElement, {
      attributes: true, attributeFilter: ['lang', 'dir']
    });
  }

  global.__studioLines = { split: splitAll };
})(window);
