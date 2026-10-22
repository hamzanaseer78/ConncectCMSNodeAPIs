const { CATALOG } = require("./prisma-relations");

const CORE_TABLES = [
  {
    name: "job",
    columns: ["recno", "tenantid", "branchid", "code", "date", "assignedto", "followupby", "customerid", "statusid", "priority", "totalcost", "complaintby", "iscompleted", "isresolved", "manualjobno", "quotationstatus", "city", "area", "groupid", "serviceid", "faultid", "brandid", "jobtypeid", "jobsourceid", "erpproductid"],
    sql(scope) {
      const assigned = scope.manageBranch ? "TRUE" : `assignedto = ${scope.userid}`;
      return `SELECT recno, tenantid, branchid, code, date, assignedto, followupby, customerid, statusid, priority, totalcost, complaintby, iscompleted, isresolved, manualjobno, quotationstatus, city, area, groupid, serviceid, faultid, brandid, jobtypeid, jobsourceid, erpproductid FROM public.job WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid} AND ${assigned}`;
    }
  },
  {
    name: "jobexpenses",
    columns: ["recno", "jobid", "tenantid", "branchid", "amount", "createdat"],
    sql(scope) {
      const assigned = scope.manageBranch ? "TRUE" : `j.assignedto = ${scope.userid}`;
      return `SELECT e.recno, e.jobid, e.tenantid, e.branchid, e.amount, e.createdat FROM public.jobexpenses e INNER JOIN public.job j ON j.recno = e.jobid AND j.tenantid = ${scope.tenantid} AND j.branchid = ${scope.branchid} WHERE e.tenantid = ${scope.tenantid} AND e.branchid = ${scope.branchid} AND ${assigned}`;
    }
  },
  {
    name: "jobcollections",
    columns: ["recno", "jobid", "tenantid", "branchid", "amount", "collectedat"],
    sql(scope) {
      const assigned = scope.manageBranch ? "TRUE" : `j.assignedto = ${scope.userid}`;
      return `SELECT c.recno, c.jobid, c.tenantid, c.branchid, c.amount, c.collectedat FROM public.jobcollections c INNER JOIN public.job j ON j.recno = c.jobid AND j.tenantid = ${scope.tenantid} AND j.branchid = ${scope.branchid} WHERE c.tenantid = ${scope.tenantid} AND c.branchid = ${scope.branchid} AND ${assigned}`;
    }
  },
  {
    name: "customers",
    columns: ["customerid", "tenantid", "branchid", "name"],
    sql(scope) {
      return `SELECT customerid, tenantid, branchid, name FROM public.customers WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid}`;
    }
  },
  {
    name: "jobstatuses",
    columns: ["recno", "tenantid", "title", "iscompletedstatus", "isresolvedstatus", "iscancelledstatus"],
    sql(scope) {
      return `SELECT recno, tenantid, title, iscompletedstatus, isresolvedstatus, iscancelledstatus FROM public.jobstatuses WHERE tenantid = ${scope.tenantid}`;
    }
  },
  {
    name: "userattendancesession",
    columns: ["recno", "tenantid", "branchid", "userid", "status", "isopen", "checkinat"],
    sql(scope) {
      const who = scope.manageBranch ? "TRUE" : `userid = ${scope.userid}`;
      return `SELECT recno, tenantid, branchid, userid, status, isopen, checkinat FROM public.userattendancesession WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid} AND ${who}`;
    }
  },
  {
    name: "userorganizations",
    columns: ["recno", "userid", "tenantid", "branchid", "isblocked"],
    sql(scope) {
      return `SELECT recno, userid, tenantid, branchid, isblocked FROM public.userorganizations WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid}`;
    }
  },
  {
    name: "users",
    columns: ["userid", "name"],
    sql(scope) {
      return `SELECT u.userid, u.name FROM public.users u INNER JOIN public.userorganizations uo ON uo.userid = u.userid WHERE uo.tenantid = ${scope.tenantid} AND uo.branchid = ${scope.branchid}`;
    }
  },
  {
    name: "branches",
    columns: ["branchid", "tenantid", "name"],
    sql(scope) {
      return `SELECT branchid, tenantid, name FROM public.branches WHERE tenantid = ${scope.tenantid} AND branchid = ${scope.branchid}`;
    }
  }
];

function lookupSql(model, scope) {
  const pk = model.idField;
  const display = model.displayFields[0] || "name";
  const extras = [];
  if (model.hasTenantid) extras.push("tenantid");
  if (model.hasBranchid) extras.push("branchid");
  const columns = [pk, display, ...extras].filter((name, index, list) => name && list.indexOf(name) === index);
  const where = [];
  if (model.hasTenantid) where.push(`tenantid = ${scope.tenantid}`);
  if (model.hasBranchid) where.push(`branchid = ${scope.branchid}`);
  const filter = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  return `SELECT ${columns.join(", ")} FROM public.${model.name}${filter}`;
}

function lookupTables() {
  const have = new Set(CORE_TABLES.map((table) => table.name));
  const extra = [];
  CATALOG.models.forEach((model) => {
    if (have.has(model.name)) return;
    const targeted = CATALOG.relations.some((relation) => relation.targetTable === model.name);
    if (!targeted || !model.idField || !model.displayFields.length) return;
    extra.push({
      name: model.name,
      columns: [model.idField, ...model.displayFields],
      sql(scope) {
        return lookupSql(model, scope);
      }
    });
  });
  return extra;
}

const TABLES = Object.freeze([...CORE_TABLES, ...lookupTables()]);

const TABLE_BY_NAME = new Map(TABLES.map((table) => [table.name, table]));

function inspectSchema(scope) {
  return {
    notes: [
      "Queries run only against these authorized tables.",
      "Tenant and branch are applied by the server. Do not add tenantid, branchid, or userid from the question.",
      "Amount to collect is SUM(job.totalcost) by job.date. Cash collected is SUM(jobcollections.amount) by collectedat. Expenses are SUM(jobexpenses.amount) by createdat. Do not call the difference profit."
    ],
    manageBranch: Boolean(scope.manageBranch),
    tables: TABLES.map((table) => ({ name: table.name, columns: table.columns }))
  };
}

function authorizedWithSql(scope, names) {
  const wanted = Array.isArray(names) && names.length
    ? TABLES.filter((table) => names.includes(table.name))
    : TABLES;
  return wanted.map((table) => `"${table.name}" AS (${table.sql(scope)})`).join(",\n");
}

module.exports = {
  TABLES,
  TABLE_BY_NAME,
  inspectSchema,
  authorizedWithSql
};
