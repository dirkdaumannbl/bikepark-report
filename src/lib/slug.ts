// Single canonical slug function used for the parks collection id, routing,
// and blog/editorial references. Handles the two name shapes in the data:
// `pin_name` (decoded unicode, e.g. "Kitzbuhel") and `name` (may carry HTML
// entities, e.g. "Kitzb&uuml;hel"), plus the German eszett and diacritics.
const NAMED: Record<string, string> = {
  amp: 'and', auml: 'ae', ouml: 'oe', uuml: 'ue', szlig: 'ss',
  agrave: 'a', aacute: 'a', eacute: 'e', egrave: 'e', iacute: 'i',
  oacute: 'o', uacute: 'u', ndash: '-', mdash: '-', middot: '-',
};

export function parkSlug(p: { name?: string; pin_name?: string }): string {
  let s = p.pin_name || p.name || '';
  s = s.replace(/<[^>]+>/g, ' ');                                   // strip any tags
  s = s.replace(/&([a-zA-Z]+);/g, (_, n) => NAMED[n.toLowerCase()] ?? ' '); // named entities
  s = s.replace(/&#\d+;/g, ' ');                                   // numeric entities
  s = s.replace(/ß/g, 'ss');                                  // eszett -> ss
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');                  // strip diacritics
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
