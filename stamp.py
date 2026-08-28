#!/usr/bin/env python
"""Stamp css/js references with the current commit, so a deploy can never serve
new HTML against a stale stylesheet or script.

GitHub Pages sends Cache-Control: max-age=600 on everything and that cannot be
configured, so for ten minutes after a push a browser may hold the old copy of
any file. The dangerous case is not staleness itself - it is a MISMATCH: new
HTML paired with the previous falcon-media.js. Giving every reference a ?v= that
changes with the commit means the moment the HTML updates, its assets are new
URLs and cannot come from cache. Run before committing."""
import io, re, subprocess, sys, glob

ver = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD']).decode().strip()
pat = re.compile(r'(href|src)="((?:css|js)/[^"?]+)(?:\?v=[^"]*)?"')
for f in glob.glob('*.html'):
    s = io.open(f, encoding='utf-8').read()
    new = pat.sub(lambda m: '%s="%s?v=%s"' % (m.group(1), m.group(2), ver), s)
    if new != s:
        io.open(f, 'w', encoding='utf-8', newline='').write(new)
        print('%-16s stamped v=%s' % (f, ver))
