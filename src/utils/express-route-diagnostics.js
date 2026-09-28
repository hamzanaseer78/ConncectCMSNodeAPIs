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

function findJobCodeSettingsInApp(app) {
  const mounts = collectMountedRouters(app);
  for (const mount of mounts) {
    const pattern = mount.pattern || "";
    if (!pattern.includes("jobs") || !pattern.includes("code")) continue;
    const settings = mount.routes.find(
      (route) => route.path === "/settings" && route.methods.includes("get")
    );
    if (settings) {
      return { mounted: true, mountPattern: pattern, routes: mount.routes };
    }
  }
  return { mounted: false, mounts: mounts.map((m) => m.pattern).slice(0, 20) };
}

function buildRouteDiagnostics(app) {
  const rootDir = path.join(__dirname, "..", "..");
  const routerFile = path.join(rootDir, "src/routes/job-code-settings.routes.js");
  const appFile = path.join(rootDir, "src/app.js");

  let appJsContainsMount = false;
  try {
    const appSource = fs.readFileSync(appFile, "utf8");
    appJsContainsMount = appJsContainsMount || appSource.includes('app.use("/api/jobs/code"');
    appJsContainsMount = appJsContainsMount || appSource.includes("app.use('/api/jobs/code'");
  } catch {
    appJsContainsMount = null;
  }

  const jobController = require("../controllers/job.controller");

  return {
    processCwd: process.cwd(),
    serverEntry: require.main?.filename ?? null,
    uptimeSeconds: Math.round(process.uptime()),
    onDisk: {
      jobCodeSettingsRouterFile: fs.existsSync(routerFile),
      appJsReferencesJobCodeMount: appJsContainsMount
    },
    runningProcess: {
      ...findJobCodeSettingsInApp(app),
      handlers: {
        getJobCodeSettings: typeof jobController.getJobCodeSettings,
        saveJobCodeSettings: typeof jobController.saveJobCodeSettings
      }
    },
    hint:
      "If onDisk is true but runningProcess.mounted is false, restart PM2 (pm2 restart connect-cms-api) from the same folder as processCwd."
  };
}

module.exports = {
  buildRouteDiagnostics,
  findJobCodeSettingsInApp
};
