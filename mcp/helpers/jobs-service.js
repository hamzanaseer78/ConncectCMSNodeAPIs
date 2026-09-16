const jobsAllService = require("../../src/services/jobs-all.service");
const jobsMyService = require("../../src/services/jobs-my.service");
const jobsTeamService = require("../../src/services/jobs-team.service");

function getJobsListService(mode = "my") {
  if (mode === "all") {
    return jobsAllService;
  }
  if (mode === "team") {
    return jobsTeamService;
  }
  return jobsMyService;
}

module.exports = {
  getJobsListService
};
