// Découpe un titre (HTML simple : texte et <em>) en mots animables un à un, à la construction du site :
// <span class="word"><span class="word__in" style="--w:N">mot</span></span>.
// Les espaces insécables restent dans le mot ; la ponctuation collée à un <em> reste avec lui.
export function splitWords(html, start = 0) {
  let w = start;
  const grouped = html.replace(/(<em>[^<]*<\/em>)([.,;:!?…]+)/g, '<span class="nowrap">$1$2</span>');
  return grouped
    .split(/(<[^>]+>)/)
    .map((part) =>
      part.startsWith('<')
        ? part
        : part
            .split(/( +)/)
            .map((t) => (t === '' || / +/.test(t) ? t : `<span class="word"><span class="word__in" style="--w:${w++}">${t}</span></span>`))
            .join(''),
    )
    .join('');
}
