const JobsListService = require("./jobs-list.service");

module.exports = new JobsListService({ mode: "my", restrictToAssignee: true });
