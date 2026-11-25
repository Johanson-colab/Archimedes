function safeUrl(value: string) { try { const parsed = new URL(value); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : ''; } catch { return ''; } }
function csv(value: unknown) { let text = String(value ?? ''); if (/^\s*[=+\-@\t\r]/.test(text)) text = `'${text}`; return `"${text.replace(/"/g, '""')}"`; }
function bib(value: unknown) { return String(value ?? '').replace(/[\r\n]+/g, ' ').trim().replace(/[\\{}%&#_$]/g, character => character === '\\' ? '\\textbackslash{} ' : `\\${character}`); }
function ris(value: unknown) { return String(value ?? '').replace(/[\r\n]+/g, ' ').trim(); }
export function exportLiteraturePapers(papers: AcademicSearchResult[], format: 'json' | 'csv' | 'bib' | 'ris') {
  if (format === 'json') return JSON.stringify(papers, null, 2);
  if (format === 'csv') return [['Title','Authors','Year','Venue','DOI','URL','Abstract'].map(csv).join(','), ...papers.map(p => [p.title, p.authors.join('; '), p.year, p.venue, p.doi, safeUrl(p.url), p.abstract].map(csv).join(','))].join('\r\n');
  if (format === 'ris') return papers.map(p => [`TY  - JOUR`, `TI  - ${ris(p.title)}`, ...p.authors.map(a => `AU  - ${ris(a)}`), ...(p.year ? [`PY  - ${p.year}`] : []), ...(p.venue ? [`JO  - ${ris(p.venue)}`] : []), ...(p.doi ? [`DO  - ${ris(p.doi)}`] : []), ...(safeUrl(p.url) ? [`UR  - ${safeUrl(p.url)}`] : []), `ER  - `].join('\n')).join('\n\n');
  return papers.map((p, index) => { const key = `paper${index + 1}`; const fields = [`title = {${bib(p.title)}}`, p.authors.length && `author = {${p.authors.map(bib).join(' and ')}}`, p.year && `year = {${p.year}}`, p.venue && `journal = {${bib(p.venue)}}`, p.doi && `doi = {${bib(p.doi)}}`, safeUrl(p.url) && `url = {${safeUrl(p.url)}}`].filter(Boolean); return `@article{${key},\n  ${fields.join(',\n  ')}\n}`; }).join('\n\n');
}
