/**
 * How long a resolved job took, using the same start used for resolution hours:
 * assignedat, otherwise first response, otherwise detail createdat, otherwise job.date.
 * End is jobdetails.resolvedat. A job is in exactly one bucket.
 */
const RESOLUTION_BUCKETS = Object.freeze([
  { id: "single_day", field: "singleDay", label: "Single Day", maxHours: 24 },
  { id: "three_days", field: "threeDays", label: "3 Days", maxHours: 72 },
  { id: "five_days", field: "fiveDays", label: "5 Days", maxHours: 120 },
  { id: "seven_days", field: "sevenDays", label: "7 Days", maxHours: 168 },
  { id: "over_seven_days", field: "overSevenDays", label: "7+ Days", maxHours: null }
]);

const RESOLUTION_BUCKET_IDS = RESOLUTION_BUCKETS.map((bucket) => bucket.id);

function resolutionDetail(job) {
  if (!job) return null;
  if (Array.isArray(job.jobdetails)) return job.jobdetails[0] ?? null;
  return job.jobdetails ?? null;
}

function resolutionHours(job) {
  const detail = resolutionDetail(job);
  if (!detail?.resolvedat) return null;

  const end = new Date(detail.resolvedat);
  const startSource =
    detail.assignedat ??
    detail.firstresponseat ??
    detail.createdat ??
    (job.date ? new Date(job.date) : null);

  if (!startSource || Number.isNaN(end.getTime())) return null;

  const start = new Date(startSource);
  if (Number.isNaN(start.getTime())) return null;

  const hours = (end.getTime() - start.getTime()) / 3600000;
  return hours >= 0 ? hours : null;
}

function resolutionBucketId(jobOrHours) {
  const hours = typeof jobOrHours === "number" ? jobOrHours : resolutionHours(jobOrHours);
  if (hours == null) return null;

  for (const bucket of RESOLUTION_BUCKETS) {
    if (bucket.maxHours == null || hours <= bucket.maxHours) {
      return bucket.id;
    }
  }

  return "over_seven_days";
}

function isResolutionBucket(value) {
  return RESOLUTION_BUCKET_IDS.includes(String(value || ""));
}

function emptyBucketCounts() {
  return {
    singleDay: 0,
    threeDays: 0,
    fiveDays: 0,
    sevenDays: 0,
    overSevenDays: 0
  };
}

function bucketField(bucketId) {
  return RESOLUTION_BUCKETS.find((bucket) => bucket.id === bucketId)?.field ?? null;
}

module.exports = {
  RESOLUTION_BUCKETS,
  RESOLUTION_BUCKET_IDS,
  resolutionHours,
  resolutionBucketId,
  isResolutionBucket,
  emptyBucketCounts,
  bucketField
};
