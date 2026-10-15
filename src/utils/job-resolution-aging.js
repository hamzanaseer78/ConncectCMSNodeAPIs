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

function jobClockStart(job) {
  const detail = resolutionDetail(job);
  return (
    detail?.assignedat ??
    detail?.firstresponseat ??
    detail?.createdat ??
    (job?.date ? new Date(job.date) : null)
  );
}

function hoursBetween(startSource, endSource) {
  if (!startSource || !endSource) return null;
  const start = new Date(startSource);
  const end = new Date(endSource);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const hours = (end.getTime() - start.getTime()) / 3600000;
  return hours >= 0 ? hours : null;
}

function resolutionHours(job) {
  const detail = resolutionDetail(job);
  if (!detail?.resolvedat) return null;
  return hoursBetween(jobClockStart(job), detail.resolvedat);
}

function openHours(job, now = new Date()) {
  const detail = resolutionDetail(job);
  if (detail?.resolvedat) return null;
  return hoursBetween(jobClockStart(job), now);
}

function firstResponseHours(job) {
  const detail = resolutionDetail(job);
  if (!detail?.firstresponseat) return null;
  const start = job?.date ? new Date(job.date) : detail.createdat;
  return hoursBetween(start, detail.firstresponseat);
}

function hoursToBucketId(hours) {
  if (hours == null) return null;
  for (const bucket of RESOLUTION_BUCKETS) {
    if (bucket.maxHours == null || hours <= bucket.maxHours) {
      return bucket.id;
    }
  }
  return "over_seven_days";
}

function resolutionBucketId(jobOrHours) {
  const hours = typeof jobOrHours === "number" ? jobOrHours : resolutionHours(jobOrHours);
  return hoursToBucketId(hours);
}

function openAgingBucketId(jobOrHours, now) {
  const hours = typeof jobOrHours === "number" ? jobOrHours : openHours(jobOrHours, now);
  return hoursToBucketId(hours);
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
  openHours,
  firstResponseHours,
  resolutionBucketId,
  openAgingBucketId,
  isResolutionBucket,
  emptyBucketCounts,
  bucketField,
  jobClockStart
};
