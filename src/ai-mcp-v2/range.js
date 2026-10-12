function monthRange(period, now = new Date()) {
  const selected = period === "previous_month" ? "previous_month" : "this_month";
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = selected === "previous_month"
    ? new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 1, 1))
    : base;
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  return {
    period: selected,
    from,
    to,
    label: from.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    })
  };
}

module.exports = {
  monthRange
};
