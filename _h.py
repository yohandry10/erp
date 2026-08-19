import io, re
def load(p): return io.open(p, encoding='utf-8', newline='').read()
def save(p, s): io.open(p, 'w', encoding='utf-8', newline='').write(s)
def sub(s, old, new, label):
    pat = re.compile(''.join(re.escape(l) + r'\r?\n' for l in old.split('\n')[:-1]) + re.escape(old.split('\n')[-1]))
    m = pat.search(s)
    if not m: raise SystemExit(f"NO ENCONTRADO: {label}")
    if pat.search(s, m.end()): raise SystemExit(f"AMBIGUO: {label}")
    nl = '\r\n' if '\r\n' in s[m.start():m.end()] else ('\r\n' if '\r\n' in s else '\n')
    return s[:m.start()] + new.replace('\n', nl) + s[m.end():]
