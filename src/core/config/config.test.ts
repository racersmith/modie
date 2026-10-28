import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  DEFAULT_PROTECTED_BRANCHES,
  DEFAULT_TRUNK_BRANCH,
  findModieConfigFile,
  loadModieConfig,
} from "./index.ts";

const execFileAsync = promisify(execFile);

describe("Modie Configuration Loader (ADR-9, ADR-10, RULE-28)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "modie-config-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should return sensible defaults when no config file or git config exists", async () => {
    const config = await loadModieConfig(tempDir);
    expect(config.trunk).toBe(DEFAULT_TRUNK_BRANCH);
    expect(config.protectedBranches).toEqual(DEFAULT_PROTECTED_BRANCHES);
    expect(config.prefix).toBeUndefined();
    expect(config.configPath).toBeUndefined();
  });

  it("should load configuration from .modie/config.json", async () => {
    const modieDir = join(tempDir, ".modie");
    await mkdir(modieDir, { recursive: true });
    const configPath = join(modieDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        git: {
          trunk: "develop",
          protectedBranches: ["main", "staging", "prod"],
          prefix: "TEAM",
        },
      }),
      "utf8",
    );

    const foundPath = findModieConfigFile(join(tempDir, "src", "sub"));
    expect(foundPath).toBe(configPath);

    const config = await loadModieConfig(join(tempDir, "src", "sub"));
    expect(config.trunk).toBe("develop");
    expect(config.protectedBranches).toEqual(["main", "staging", "prod"]);
    expect(config.prefix).toBe("TEAM");
    expect(config.configPath).toBe(configPath);
  });

  it("should support top-level trunk and protectedBranches in config.json", async () => {
    const modieDir = join(tempDir, ".modie");
    await mkdir(modieDir, { recursive: true });
    await writeFile(
      join(modieDir, "config.json"),
      JSON.stringify({
        trunk: "main",
        protectedBranches: ["release"],
      }),
      "utf8",
    );

    const config = await loadModieConfig(tempDir);
    expect(config.trunk).toBe("main");
    expect(config.protectedBranches).toEqual(["release"]);
  });

  it("should prioritize git config overrides over .modie/config.json", async () => {
    await execFileAsync("git", ["init", "-q"], { cwd: tempDir });
    await execFileAsync("git", ["config", "modie.trunk", "git-trunk"], {
      cwd: tempDir,
    });
    await execFileAsync(
      "git",
      ["config", "modie.protectedBranches", "main,production"],
      {
        cwd: tempDir,
      },
    );
    await execFileAsync("git", ["config", "modie.prefix", "GITC"], {
      cwd: tempDir,
    });

    const modieDir = join(tempDir, ".modie");
    await mkdir(modieDir, { recursive: true });
    await writeFile(
      join(modieDir, "config.json"),
      JSON.stringify({
        git: {
          trunk: "file-trunk",
          protectedBranches: ["main"],
          prefix: "FILEC",
        },
      }),
      "utf8",
    );

    const config = await loadModieConfig(tempDir);
    expect(config.trunk).toBe("git-trunk");
    expect(config.protectedBranches).toEqual(["main", "production"]);
    expect(config.prefix).toBe("GITC");
  });

  it("should throw descriptive error on invalid JSON in config file", async () => {
    const modieDir = join(tempDir, ".modie");
    await mkdir(modieDir, { recursive: true });
    await writeFile(join(modieDir, "config.json"), "{ invalid json", "utf8");

    await expect(loadModieConfig(tempDir)).rejects.toThrow(
      /Failed to parse Modie configuration file/,
    );
  });
});
