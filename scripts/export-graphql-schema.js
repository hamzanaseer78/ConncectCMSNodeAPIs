#!/usr/bin/env node
/**
 * Export GraphQL SDL for Apollo GraphOS publish or offline docs.
 * Usage: node scripts/export-graphql-schema.js [output-file]
 * Default output: schema.graphql in project root.
 */
const fs = require("fs");
const path = require("path");
const { printSchema } = require("graphql");

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "schema-export";
}

const graphqlHandler = require("../src/graphql/handler");
const outFile = path.resolve(process.cwd(), process.argv[2] || "schema.graphql");
const sdl = printSchema(graphqlHandler.schema);

fs.writeFileSync(outFile, sdl, "utf8");

const reportFields = (sdl.match(/^  jobs\w+/gm) || []).length;
console.log(`Wrote ${outFile}`);
console.log(`Report-related Query fields in SDL: ${reportFields}`);
console.log(
  sdl.includes("jobsReportsCatalog")
    ? "Includes jobsReportsCatalog"
    : "MISSING jobsReportsCatalog"
);
