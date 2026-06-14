import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { AiLinkConfig, ConfigLayer, LoadedConfig } from "../types.js";

export interface LoadConfigOptions {
  cwd?: string;
  homeDir?: string;
  extraConfigPaths?: string[];
  sessionConfig?: AiLinkConfig;
}

export function loadConfig(options: LoadConfigOptions = {}): LoadedConfig {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();
  const layers: ConfigLayer[] = [{ name: "default", exists: true }];
  let config = cloneConfig(DEFAULT_CONFIG);

  const orderedLayers: Array<{ name: string; path: string }> = [
    {
      name: "user-global",
      path: path.join(homeDir, ".ai-link", "config.yaml")
    },
    {
      name: "project-public",
      path: path.join(cwd, ".ai-link", "project.yaml")
    },
    {
      name: "project-local",
      path: path.join(cwd, ".ai-link", "local.yaml")
    },
    ...(options.extraConfigPaths ?? []).map((configPath, index) => ({
      name: `extra-${index + 1}`,
      path: path.resolve(cwd, configPath)
    }))
  ];

  for (const layer of orderedLayers) {
    if (!existsSync(layer.path)) {
      layers.push({ ...layer, exists: false });
      continue;
    }

    const parsed = readYamlConfig(layer.path);
    config = deepMerge(config, parsed);
    layers.push({ ...layer, exists: true });
  }

  if (options.sessionConfig) {
    config = deepMerge(config, options.sessionConfig);
    layers.push({ name: "session", exists: true });
  }

  return { config, layers };
}

export function readYamlConfig(filePath: string): AiLinkConfig {
  const raw = readFileSync(filePath, "utf8");
  const parsed = parse(raw) as unknown;
  if (!isRecord(parsed)) {
    return {};
  }
  return parsed as AiLinkConfig;
}

export function deepMerge<T>(base: T, override: unknown): T {
  if (!isRecord(base) || !isRecord(override)) {
    return cloneConfig(base) as T;
  }

  const result: Record<string, unknown> = { ...cloneConfig(base) };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    if (isRecord(current) && isRecord(value) && !Array.isArray(value)) {
      result[key] = deepMerge(current, value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

export function cloneConfig<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
