const HIDDEN = new Set(["tenantid", "password", "apikeycipher", "resettoken", "signuptoken"]);

const WORDS = Object.freeze({
  recno: "ID",
  city: "City",
  area: "Area",
  jobid: "Job",
  customerid: "Customer",
  statusid: "Status",
  branchid: "Branch",
  userid: "User",
  groupid: "Group",
  serviceid: "Category",
  faultid: "Subcategory",
  brandid: "Brand",
  jobtypeid: "Job Type",
  jobsourceid: "Job Source",
  erpproductid: "Product",
  assignedto: "Assigned To",
  followupby: "Follow Up By",
  createdby: "Created By",
  lastupdatedby: "Last Updated By",
  totalcost: "Total Cost",
  collectedat: "Collected At",
  createdat: "Created At",
  checkinat: "Check In",
  manualjobno: "Manual Job No",
  quotationstatus: "Quotation Status",
  complaintby: "Complaint By",
  iscompleted: "Completed",
  isresolved: "Resolved"
});

function splitName(value) {
  return String(value || "")
    .replace(/id$/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .trim();
}

function titleCase(value) {
  return splitName(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function headingFor(column, options = {}) {
  const key = String(column || "");
  if (HIDDEN.has(key.toLowerCase())) return null;
  if (key.toLowerCase() === "recno") {
    return options.sourceTable === "job" ? "SR#" : "ID";
  }
  if (WORDS[key]) return WORDS[key];
  const labeled = titleCase(key);
  return labeled || key;
}

function visibleColumns(columns, options = {}) {
  return (columns || []).filter((column) => headingFor(column, options) != null);
}

module.exports = {
  HIDDEN,
  headingFor,
  visibleColumns,
  titleCase
};
