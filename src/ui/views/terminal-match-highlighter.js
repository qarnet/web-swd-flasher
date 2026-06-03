export function highlightMatches(lineEl, searchIndex) {
  searchIndex.rebuildIfNeeded();
  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
  const replacements = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent;
    if (!text) continue;
    const result = highlightText(text, searchIndex);
    if (result !== text) replacements.push({ node, fragment: result });
  }
  for (const { node, fragment } of replacements) {
    node.replaceWith(fragment);
  }
}

export function clearHighlights(lineEl) {
  const marks = lineEl.querySelectorAll("mark.term-match, mark.term-match-current");
  for (const mark of marks) {
    mark.replaceWith(document.createTextNode(mark.textContent));
  }
  lineEl.normalize();
}

function highlightText(text, searchIndex) {
  if (!searchIndex.query || searchIndex.error) return text;
  searchIndex.rebuildIfNeeded();
  const matchFn = buildMatcherFn(searchIndex);
  if (!matchFn) return text;
  const hits = matchFn(text);
  if (hits.length === 0) return text;

  const frag = document.createDocumentFragment();
  let pos = 0;
  for (const { start, end } of hits) {
    if (start > pos) frag.appendChild(document.createTextNode(text.slice(pos, start)));
    const mark = document.createElement("mark");
    mark.className = "term-match";
    mark.textContent = text.slice(start, end);
    frag.appendChild(mark);
    pos = end;
  }
  if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
  return frag;
}

function buildMatcherFn(searchIndex) {
  if (!searchIndex.query || searchIndex.error) return null;
  if (searchIndex.mode === "regex") {
    try {
      const re = new RegExp(searchIndex.query, "gi");
      return (text) => {
        const hits = [];
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          if (m[0].length === 0) { re.lastIndex++; continue; }
          hits.push({ start: m.index, end: m.index + m[0].length });
        }
        return hits;
      };
    } catch { return null; }
  }
  const q = searchIndex.query.toLowerCase();
  return (text) => {
    const hits = [];
    const lower = text.toLowerCase();
    let pos = 0;
    while ((pos = lower.indexOf(q, pos)) !== -1) {
      hits.push({ start: pos, end: pos + q.length });
      pos++;
    }
    return hits;
  };
}

export function setCurrentMatch(rootEl, matchIndex, searchIndex) {
  const prev = rootEl.querySelector(".term-match-current");
  if (prev) { prev.classList.remove("term-match-current"); prev.classList.add("term-match"); }

  searchIndex.rebuildIfNeeded();
  const matches = searchIndex.matches;
  if (matches.length === 0) return false;
  const idx = ((matchIndex % matches.length) + matches.length) % matches.length;
  const match = matches[idx];
  const lineEl = rootEl.children[match.lineIndex];
  if (!lineEl) return false;

  let markCount = 0;
  const marks = lineEl.querySelectorAll("mark.term-match");
  if (marks.length === 0) return false;

  for (const mark of marks) {
    if (markCount === 0) {
      mark.classList.remove("term-match");
      mark.classList.add("term-match-current");
      mark.scrollIntoView({ block: "center" });
      break;
    }
    markCount++;
  }
  return true;
}
