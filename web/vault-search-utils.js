(function () {
  'use strict';
  if (window.AbuVaultSearch) return;
  var arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  var persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  function normalize(value) {
    return String(value == null ? '' : value).normalize('NFKC')
      .replace(/[٠-٩۰-۹]/g, function (digit) {
        var index = arabicDigits.indexOf(digit);
        return String(index >= 0 ? index : persianDigits.indexOf(digit));
      })
      .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/\s+/g, ' ')
      .trim().toLocaleLowerCase('ar');
  }
  function tokenize(query) {
    var value = String(query || '').slice(0, 500);
    var items = [];
    var pattern = /(-?)"([^"]+)"|(-?)([^\s"]+)/g;
    var match;
    while ((match = pattern.exec(value)) && items.length < 32) {
      var exclude = !!(match[1] || match[3]);
      var phrase = match[2] != null;
      var term = normalize(phrase ? match[2] : match[4]);
      if (term) items.push({ term: term, exclude: exclude, phrase: phrase });
    }
    return items;
  }
  function matches(query, target, mode) {
    var tokens = tokenize(query);
    if (!tokens.length) return true;
    var content = normalize(target);
    if (tokens.some(function (entry) { return entry.exclude && content.includes(entry.term); })) return false;
    var needed = tokens.filter(function (entry) { return !entry.exclude; });
    if (!needed.length) return true;
    if (mode === 'any') return needed.some(function (entry) { return content.includes(entry.term); });
    return needed.every(function (entry) { return content.includes(entry.term); });
  }
  window.AbuVaultSearch = Object.freeze({
    normalize: normalize,
    tokenize: tokenize,
    matches: matches
  });
}());
