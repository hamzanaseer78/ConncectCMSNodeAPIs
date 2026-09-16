const { z } = require("zod");

const paginationSchema = {
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional()
};

const sortSchema = {
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional()
};

const jobsModeSchema = z.enum(["my", "all", "team"]).default("my");

const jsonRecord = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional();

module.exports = {
  paginationSchema,
  sortSchema,
  jobsModeSchema,
  jsonRecord
};
