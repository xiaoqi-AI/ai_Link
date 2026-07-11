import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateConnectorRegistry } from "./contracts.js";
import { createConnectorRegistry } from "./registry.js";

const PRIVATE_MODULE_EXTENSIONS = new Set([".js", ".mjs"]);
const SAFE_LOAD_ERROR = Symbol("safePrivateConnectorLoadError");

export async function loadPrivateConnectorRegistry({
  modulePath = process.env.AI_LINK_PRIVATE_CONNECTOR_MODULE || "",
  workspaceRoot = process.cwd(),
  privateRoot = "",
  importer = (url) => import(url)
} = {}) {
  if (!modulePath) return createConnectorRegistry();

  try {
    const configuredPrivateRoot = path.resolve(privateRoot || path.join(workspaceRoot, "runtime", "private"));
    const configuredModulePath = path.resolve(workspaceRoot, modulePath);
    const [resolvedPrivateRoot, resolvedModulePath] = await Promise.all([
      realpath(configuredPrivateRoot),
      realpath(configuredModulePath)
    ]);

    if (!isInside(resolvedPrivateRoot, resolvedModulePath)) {
      throw loadError("private_module_outside_runtime_private");
    }
    if (!PRIVATE_MODULE_EXTENSIONS.has(path.extname(resolvedModulePath).toLowerCase())) {
      throw loadError("private_module_extension_not_allowed");
    }

    const metadata = await stat(resolvedModulePath);
    if (!metadata.isFile()) {
      throw loadError("private_module_not_file");
    }

    const moduleUrl = `${pathToFileURL(resolvedModulePath).href}?mtime=${metadata.mtimeMs}`;
    const privateModule = await importer(moduleUrl);
    if (typeof privateModule?.createPrivateConnectors !== "function") {
      throw loadError("private_connector_factory_missing");
    }

    const privateConnectors = await privateModule.createPrivateConnectors();
    markPrivateModes(privateConnectors);
    const registry = createConnectorRegistry({ privateConnectors });
    const issues = validateConnectorRegistry(registry).filter((issue) =>
      Object.hasOwn(privateConnectors, issue.platform) && issue.severity === "error"
    );
    if (issues.length > 0) {
      throw loadError("private_connector_contract_failed");
    }

    return registry;
  } catch (error) {
    if (error?.[SAFE_LOAD_ERROR] === true) throw error;
    throw loadError("private_connector_module_unavailable");
  }
}

function markPrivateModes(connectors) {
  if (!connectors || typeof connectors !== "object" || Array.isArray(connectors)) {
    throw loadError("invalid_private_connector_export");
  }

  for (const connector of Object.values(connectors)) {
    if (!connector || typeof connector !== "object") {
      throw loadError("invalid_private_connector_export");
    }
    if (connector.mode !== undefined && connector.mode !== "private") {
      throw loadError("invalid_private_connector_mode");
    }
    if (connector.mode === undefined) {
      try {
        Object.defineProperty(connector, "mode", {
          value: "private",
          configurable: true,
          enumerable: false
        });
      } catch {
        throw loadError("invalid_private_connector_export");
      }
    }
  }
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function loadError(reason) {
  const error = new Error("Private connector module could not be loaded safely.");
  error.code = "connector_contract_failed";
  error.reason = reason;
  error.retryable = false;
  error[SAFE_LOAD_ERROR] = true;
  return error;
}
