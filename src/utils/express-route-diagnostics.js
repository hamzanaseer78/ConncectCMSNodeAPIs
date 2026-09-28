const fs = require("fs");
const path = require("path");

/** Express 5 uses `app.router`; Express 4 uses `app._router`. */
function getAppRouterStack(app) {
  return app?.router?.stack ?? app?._router?.stack ?? [];
}

function layerPathPattern(layer) {
  if (layer?.path) return layer.path;
  if (layer?.regexp) return String(layer.regexp);
  return null;
}

/**
 * Express 5 sets `layer.path` only after `layer.match()`. Probe known job mounts.
 */
function resolveRouterMountPath(layer) {
  if (layer?.path && String(layer.path).startsWith("/")) {
    return layer.path;
  }
  if (typeof layer?.match !== "function") {
    return null;
  }
  const probes = [
    "/api/jobs/code/__probe__",
    "/api/jobs/form/__probe__",
    "/api/jobs/__probe__",
    "/api/jobs-all/__probe__",
    "/api/jobs-my/__probe__",
    "/api/jobs-team/__probe__"
  ];
  for (const probe of probes) {
    if (layer.match(probe)) {
      return layer.path ?? null;
    }
  }
  return null;
}

function collectMountedRouters(app) {
  const mounts = [];
  const stack = getAppRouterStack(app);
  stack.forEach((layer) => {
    if (layer.name !== "router" || !layer.handle?.stack) return;
    const mountPath = resolveRouterMountPath(layer);
    mounts.push({
      mountPath,
      pattern: layerPathPattern(layer) ?? mountPath,
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
    if (mount.mountPath === "/api/jobs/code") {
      const settings = mount.routes.find(
        (route) => route.path === "/settings" && route.methods.includes("get")
      );
      if (settings) {
        return {
          mounted: true,
          via: "api/jobs/code",
          mountPattern: mount.pattern,
          routes: mount.routes
        };
      }
    }
  }

  for (const mount of mounts) {
    if (mount.mountPath === "/api/jobs") {
      const route = mount.routes.find(
        (r) => r.path === "/code/settings" && r.methods.includes("get")
      );
      if (route) {
        return {
          mounted: true,
          via: "api/jobs/code/settings (job.routes)",
          mountPattern: mount.pattern
        };
      }
    }
  }

  for (const mount of mounts) {
    if (mount.mountPath === "/api/jobs/form") {
      const route = mount.routes.find(
        (r) => r.path === "/code-settings" && r.methods.includes("get")
      );
      if (route) {
        return {
          mounted: true,
          via: "api/jobs/form/code-settings",
          mountPattern: mount.pattern
        };
      }
    }
  }

  return {
    mounted: false,
    mounts: mounts
      .filter((m) => m.mountPath && String(m.mountPath).includes("jobs"))
      .map((m) => ({ mountPath: m.mountPath, routes: m.routes.length }))
  };
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
    expressVersion: require("express/package.json").version,
    onDisk: readJobCodeOnDiskHints(),
    runningProcess: {
      ...findJobCodeSettingsInApp(app),
      handlers: {
        getJobCodeSettings: typeof jobController.getJobCodeSettings,
        saveJobCodeSettings: typeof jobController.saveJobCodeSettings
      }
    },
    hint:
      "If onDisk is true but mounted is false on Express 5+, pull latest diagnostics fix. Otherwise Stop then Start the aaPanel Node Project from processCwd."
  };
}

module.exports = {
  buildRouteDiagnostics,
  findJobCodeSettingsInApp,
  readJobCodeOnDiskHints,
  collectMountedRouters
};
