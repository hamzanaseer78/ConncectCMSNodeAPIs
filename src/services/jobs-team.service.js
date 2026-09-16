const JobsListService = require("./jobs-list.service");
const { loadTeamMembers } = require("../utils/user-manager");

class JobsTeamListService extends JobsListService {
  async list(auth, query = {}) {
    const response = await super.list(auth, query);
    const teamMembers = await loadTeamMembers(auth);
    return {
      ...response,
      teamMembers: teamMembers.map((member) => ({
        userid: member.userid,
        name: member.name,
        email: member.email
      }))
    };
  }

  async statsKpis(auth, query = {}) {
    const response = await super.statsKpis(auth, query);
    const teamMembers = await loadTeamMembers(auth);
    return {
      ...response,
      teamMembers: teamMembers.map((member) => ({
        userid: member.userid,
        name: member.name,
        email: member.email
      }))
    };
  }
}

module.exports = new JobsTeamListService({
  mode: "team",
  restrictToTeam: true
});
