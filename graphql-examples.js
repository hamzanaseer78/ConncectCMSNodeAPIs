#!/usr/bin/env node

/**
 * GraphQL API Test Suite
 * 
 * This file contains example queries to test the GraphQL API
 * Run with: node graphql-examples.js
 * 
 * Before running:
 * 1. Start the server: npm run dev
 * 2. Get a JWT token from /api/auth/signin
 * 3. Update the TOKEN variable below with your token
 */

const http = require('http');

// ===== CONFIGURATION =====
const TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Replace with actual JWT token
const API_URL = 'http://localhost:3000/graphql';
const TIMEOUT = 5000;

// ===== HELPER FUNCTIONS =====

/**
 * Make GraphQL request
 */
async function graphqlRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      query,
      variables
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': `Bearer ${TOKEN}`
      },
      timeout: TIMEOUT
    };

    const req = http.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response);
        } catch (err) {
          reject(new Error(`Failed to parse response: ${err.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

/**
 * Print formatted result
 */
function printResult(testName, result, duration) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📝 ${testName}`);
  console.log(`⏱️  Duration: ${duration}ms`);
  console.log(`${'='.repeat(60)}`);
  
  if (result.errors) {
    console.log('❌ ERRORS:');
    result.errors.forEach(err => {
      console.log(`  - ${err.message}`);
    });
  } else {
    console.log('✅ SUCCESS:');
    console.log(JSON.stringify(result.data, null, 2));
  }
}

// ===== TEST QUERIES =====

/**
 * Test 1: Dashboard Summary
 * Gets all dashboard metrics
 */
const dashboardSummaryQuery = `
  query DashboardSummary {
    dashboardSummary {
      tenantid
      branchid
      users
      customers
      products
      activePolicies
    }
  }
`;

/**
 * Test 2: Single Resource Report
 * Gets count for customers
 */
const singleResourceQuery = `
  query CustomerReport {
    resourceReport(resource: "customers") {
      resource
      total
    }
  }
`;

/**
 * Test 3: All Resource Reports
 * Gets reports for all available resources
 */
const allReportsQuery = `
  query AllReports {
    reports {
      resource
      total
    }
  }
`;

/**
 * Test 4: Multiple Resources (Aliased)
 * Gets multiple resources in one query with aliases
 */
const multipleResourcesQuery = `
  query MultipleResources {
    customers: resourceReport(resource: "customers") {
      resource
      total
    }
    products: resourceReport(resource: "products") {
      resource
      total
    }
    policies: resourceReport(resource: "policies") {
      resource
      total
    }
    areas: resourceReport(resource: "areas") {
      resource
      total
    }
  }
`;

/**
 * Test 5: Dashboard + Reports Combined
 * Gets dashboard summary and all reports in one query
 */
const combinedQuery = `
  query DashboardAndReports {
    dashboardSummary {
      tenantid
      branchid
      users
      customers
      products
      activePolicies
    }
    reports {
      resource
      total
    }
  }
`;

/**
 * Test 6: Schema Introspection
 * Discovers available types in the schema
 */
const schemaIntrospectionQuery = `
  query SchemaIntrospection {
    __schema {
      queryType {
        name
        fields {
          name
          description
        }
      }
      types {
        name
        description
      }
    }
  }
`;

/**
 * Test 7: Query Type Details
 * Gets detailed information about Query type
 */
const queryTypeDetailsQuery = `
  query QueryTypeDetails {
    __type(name: "Query") {
      name
      description
      fields {
        name
        description
        type {
          name
          kind
        }
        args {
          name
          type {
            name
            kind
          }
        }
      }
    }
  }
`;

/**
 * Test 8: DashboardSummary Type Details
 * Gets detailed information about DashboardSummary type
 */
const dashboardTypeDetailsQuery = `
  query DashboardTypeDetails {
    __type(name: "DashboardSummary") {
      name
      description
      fields {
        name
        description
        type {
          name
          kind
        }
      }
    }
  }
`;

/**
 * Test 9: ReportItem Type Details
 * Gets detailed information about ReportItem type
 */
const reportItemTypeDetailsQuery = `
  query ReportItemTypeDetails {
    __type(name: "ReportItem") {
      name
      description
      fields {
        name
        description
        type {
          name
          kind
        }
      }
    }
  }
`;

/**
 * Test 10: Invalid Resource (Error Case)
 * Tests error handling
 */
const invalidResourceQuery = `
  query InvalidResource {
    resourceReport(resource: "invalidresource") {
      resource
      total
    }
  }
`;

// ===== MAIN TEST RUNNER =====

async function runTests() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║       GraphQL API Test Suite - ConnectCMS                 ║
╚═══════════════════════════════════════════════════════════╝
  `);

  if (TOKEN === 'YOUR_JWT_TOKEN_HERE') {
    console.log('⚠️  WARNING: Please set a valid JWT token first!');
    console.log('   Update the TOKEN variable with your actual JWT token.');
    console.log('   Get one from: http://localhost:3000/api/auth/signin');
    process.exit(1);
  }

  const tests = [
    { name: '1. Dashboard Summary', query: dashboardSummaryQuery },
    { name: '2. Single Resource Report', query: singleResourceQuery },
    { name: '3. All Resources Reports', query: allReportsQuery },
    { name: '4. Multiple Resources (Aliased)', query: multipleResourcesQuery },
    { name: '5. Dashboard + Reports Combined', query: combinedQuery },
    { name: '6. Schema Introspection', query: schemaIntrospectionQuery },
    { name: '7. Query Type Details', query: queryTypeDetailsQuery },
    { name: '8. DashboardSummary Type Details', query: dashboardTypeDetailsQuery },
    { name: '9. ReportItem Type Details', query: reportItemTypeDetailsQuery },
    { name: '10. Invalid Resource (Error Test)', query: invalidResourceQuery }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const startTime = Date.now();
      const result = await graphqlRequest(test.query);
      const duration = Date.now() - startTime;

      printResult(test.name, result, duration);

      if (result.errors) {
        failed++;
      } else {
        passed++;
      }
    } catch (err) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`❌ ${test.name}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`Error: ${err.message}`);
      failed++;
    }

    // Add delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('📊 TEST SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Passed: ${passed}/${tests.length}`);
  console.log(`❌ Failed: ${failed}/${tests.length}`);
  console.log(`Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
  console.log(`${'='.repeat(60)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

// ===== USAGE INSTRUCTIONS =====

function showInstructions() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                 GraphQL API Test Guide                           ║
╚══════════════════════════════════════════════════════════════════╝

📋 SETUP:
  1. Start the server: npm run dev
  2. Get JWT token: curl -X POST http://localhost:3000/api/auth/signin
  3. Set TOKEN variable in this file
  4. Run: node graphql-examples.js

🧪 MANUAL TESTING:
  1. Open: http://localhost:3000/graphql/playground
  2. Paste your JWT token in the "Bearer Token" field
  3. Copy queries from this file into the playground
  4. Use Ctrl+Space for autocomplete
  5. Click the "Docs" tab to explore schema

📚 SCHEMA EXPLORER:
  - Right panel shows all available types
  - Hover over fields for documentation
  - Click types to view details

💡 USEFUL QUERIES:
  - dashboardSummaryQuery: Get dashboard metrics
  - allReportsQuery: Get all resource counts
  - multipleResourcesQuery: Get multiple resources at once
  - schemaIntrospectionQuery: Explore GraphQL schema

🔗 RESOURCES:
  - GraphQL Docs: /api-docs (Swagger)
  - GraphQL Schema: /graphql/playground
  - Schema Info: See GRAPHQL_SCHEMA.md

  `);
}

// Run tests if token is set
if (TOKEN !== 'YOUR_JWT_TOKEN_HERE') {
  runTests().catch(console.error);
} else {
  showInstructions();
}
