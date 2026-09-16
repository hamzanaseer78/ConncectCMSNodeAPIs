const { PublicJobStatsService } = require("../services/public-job-stats.service");

const publicJobStatsService = new PublicJobStatsService();

async function getPublicJobStats(req, res, next) {
  try {
    const data = await publicJobStatsService.getStats(req.query || {});
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPublicJobStats
};
