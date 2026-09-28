const fs = require("fs");
const path = require("path");

function layerPathPattern(layer) {
  if (!layer?.regexp) return null;
  return String(layer.regexp);
}

function collectMountedRouters(app) {
  const mounts = [];
  const stack = app?._router?.stack || [];
  stack.forEach((layer) => {
    if (layer.name !== "router" || !layer.handle?.stack) return;
    mounts.push({
      pattern: layerPathPattern(layer),
      routes: layer.handle.stack
        .filter((inner) => inner.route?.path != null)
        .map((inner) => ({
          path: inner.route.path,
          methods: Object.keys(inner.route.methods || {}).filter((m) => inner.route.methods[m])
        }))
    });
  });
  return mounts;
}

function isJobsMainMountPattern(pattern) {
  if (!pattern.includes("jobs")) return false;
  if (/jobs-all|jobs-my|jobs-team/i.test(pattern)) return false;
  return true;
}

function findJobCodeSettingsInApp(app) {
  const mounts = collectMountedRouters(app);

  for (const mount of mounts) {
    const pattern = mount.pattern || "";
    if (!pattern.includes("jobs") || !pattern.includes("code")) continue;
    const settings = mount.routes.find(
      (route) => route.path === "/settings" && route.methods.includes("get")
    );
    if (settings) {
      return {
        mounted: true,
        via: "api/jobs/code",
        mountPattern: pattern,
        routes: mount.routes
      };
    }
  }

  for (const mount of mounts) {
    const pattern = mount.pattern || "";
    if (!isJobsMainMountPattern(pattern) || pattern.includes("form")) continue;
    const route = mount.routes.find(
      (r) => r.path === "/code/settings" && r.methods.includes("get")
    );
    if (route) {
      return { mounted: true, via: "api/jobs/code/settings (job.routes)", mountPattern: pattern };
    }
  }

  for (const mount of mounts) {
    const pattern = mount.pattern || "";
    if (!pattern.includes("jobs") || !pattern.includes("form")) continue;
    const route = mount.routes.find(
      (r) => r.path === "/code-settings" && r.methods.includes("get")
    );
    if (route) {
      return { mounted: true, via: "api/jobs/form/code-settings", mountPattern: pattern };
    }
  }

  return { mounted: false, mounts: mounts.map((m) => m.pattern).slice(0, 20) };
}

function readJobCodeOnDiskHints() {
  const rootDir = path.join(__dirname, "..", "..");
  const routerFile = path.join(rootDir, "src/routes/job-code-settings.routes.js");
  const appFile = path.join(rootDir, "src/app.js");
  const jobRoutesFile = path.join(rootDir, "src/routes/job.routes.js");
  const serviceFile = path.join(rootDir, "src/services/job-code-settings.service.js");

  let appJsReferencesJobCodeMount = null;
  let jobRoutesHasCodeSettings = null;
  try {
    const appSource = fs.readFileSync(appFile, "utf8");
    appJsReferencesJobCodeMount =
      appSource.includes('app.use("/api/jobs/code"') ||
      appSource.includes("app.use('/api/jobs/code'");
  } catch {
    appJsReferencesJobCodeMount = null;
  }
  try {
    const jobRoutesSource = fs.readFileSync(jobRoutesFile, "utf8");
    jobRoutesHasCodeSettings = jobRoutesSource.includes('"/code/settings"');
  } catch {
    jobRoutesHasCodeSettings = null;
  }

  return {
    jobCodeSettingsRouterFile: fs.existsSync(routerFile),
    jobCodeSettingsServiceFile: fs.existsSync(serviceFile),
    appJsReferencesJobCodeMount,
    jobRoutesHasCodeSettings
  };
}

function buildRouteDiagnostics(app) {
  const jobController = require("../controllers/job.controller");

  return {
    processCwd: process.cwd(),
    serverEntry: require.main?.filename ?? null,
    uptimeSeconds: Math.round(process.uptime()),
    onDisk: readJobCodeOnDiskHints(),
    runningProcess: {
      ...findJobCodeSettingsInApp(app),
      handlers: {
        getJobCodeSettings: typeof jobController.getJobCodeSettings,
        saveJobCodeSettings: typeof jobController.saveJobCodeSettings
      }
    },
    hint:
      "If onDisk files exist but runningProcess.mounted is false, Stop then Start the aaPanel Node Project (same path as processCwd). If onDisk is false, git pull dev (or merge dev into main) in that folder."
  };
}

module.exports = {
  buildRouteDiagnostics,
  findJobCodeSettingsInApp,
  readJobCodeOnDiskHints
};
