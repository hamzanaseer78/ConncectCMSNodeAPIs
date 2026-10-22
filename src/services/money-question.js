function asksForMoneyTotals(text) {
  const source = String(text || "").toLowerCase();
  if (/\b(workflow|how does|how do|how is|how are|explain|difference|linked|relate|related|trace|defined|calculated|why)\b/.test(source)) {
    return false;
  }
  if (/\bfinancial summary\b/.test(source)) return true;
  const metric = /\b(revenue|amount to collect|expenses?)\b/.test(source);
  const figure = /\b(total|totals|summary)\b/.test(source) || /\b(this|last|previous) month\b/.test(source);
  return metric && figure;
}

module.exports = {
  asksForMoneyTotals
};
