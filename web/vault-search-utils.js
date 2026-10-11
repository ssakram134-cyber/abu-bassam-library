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
  function phone(value) {
    var digits = normalize(value).replace(/[\s()+-]/g, '');
    if (/^07\d{9}$/.test(digits)) return digits;
    if (/^9647\d{9}$/.test(digits)) return '0' + digits.slice(3);
    if (/^009647\d{9}$/.test(digits)) return '0' + digits.slice(5);
    return '';
  }
  function containsPhone(content, expected) {
    var re = /(?:\+?9647\d{9}|009647\d{9}|07\d{9})/g;
    var found;
    while ((found = re.exec(content))) {
      var before = content.charAt(found.index - 1), after = content.charAt(re.lastIndex);
      if (/[0-9]/.test(before) || /[0-9]/.test(after)) continue;
      if (phone(found[0]) === expected) return true;
    }
    return false;
  }
  function matches(query, target, mode) {
    var tokens = tokenize(query);
    if (!tokens.length) return true;
    var content = normalize(target);
    function contains(entry) {
      var mobile = phone(entry.term);
      return mobile ? containsPhone(content, mobile) : content.includes(entry.term);
    }
    if (tokens.some(function (entry) { return entry.exclude && contains(entry); })) return false;
    var needed = tokens.filter(function (entry) { return !entry.exclude; });
    if (!needed.length) return true;
    if (mode === 'any') return needed.some(contains);
    return needed.every(contains);
  }
  window.AbuVaultSearch = Object.freeze({
    normalize: normalize,
    tokenize: tokenize,
    matches: matches,
    phone: phone
  });
}());
