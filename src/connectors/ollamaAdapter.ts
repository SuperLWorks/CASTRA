import type {
  LocalModelCapability,
  LocalModelCatalogEntry,
  LocalModelCommand,
  LocalModelRuntimeUsage,
} from "../domain/types";

export const OLLAMA_ADAPTER_ID = "ollama_loopback" as const;
export const OLLAMA_ADAPTER_VERSION = "castra-ollama-adapter/1.0.0";
export const OLLAMA_CATALOG_VERSION = "ollama-local-catalog/1.0.0";
export const OLLAMA_ENDPOINT_ORIGIN = "http://127.0.0.1:11434" as const;
export const OLLAMA_LOCALITY_EVIDENCE =
  "The adapter has no configurable origin and constructs requests only from the literal IPv4 OS-loopback origin http://127.0.0.1:11434; redirects are rejected.";

type CatalogCommand = Extract<LocalModelCommand, { type: "local_model.catalog.record" }>;
type CompletionCommand = Extract<LocalModelCommand, { type: "local_model.invocation.complete" }>;
export type OllamaCatalogResult = Omit<CatalogCommand, "type">;
export type OllamaCompletionResult = CompletionCommand["result"];

export interface OllamaGenerateRequest {
  modelName: string;
  modelDigest: string;
  prompt: string;
  maxOutputTokens: number;
}

export interface OllamaLocalAdapter {
  discover(): Promise<OllamaCatalogResult>;
  generate(request: OllamaGenerateRequest): Promise<OllamaCompletionResult>;
}

type FetchLike = typeof fetch;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nanosecondsToMilliseconds(value: unknown): number | null {
  const normalized = finite(value);
  return normalized === null ? null : normalized / 1_000_000;
}

function usageFrom(response: Record<string, unknown>): LocalModelRuntimeUsage {
  return {
    source: "ollama_response",
    promptTokens: finite(response.prompt_eval_count),
    completionTokens: finite(response.eval_count),
    totalDurationMs: nanosecondsToMilliseconds(response.total_duration),
    loadDurationMs: nanosecondsToMilliseconds(response.load_duration),
    promptEvalDurationMs: nanosecondsToMilliseconds(response.prompt_eval_duration),
    evalDurationMs: nanosecondsToMilliseconds(response.eval_duration),
  };
}

function capabilities(value: unknown): LocalModelCapability[] {
  if (!Array.isArray(value)) return [];
  const allowed: LocalModelCapability[] = ["completion", "tools", "thinking", "vision"];
  return value.filter(
    (item): item is LocalModelCapability => typeof item === "string" && allowed.includes(item as LocalModelCapability),
  );
}

function unavailableCatalog(reason: string, observedAt: string): OllamaCatalogResult {
  return {
    adapterId: OLLAMA_ADAPTER_ID,
    adapterVersion: OLLAMA_ADAPTER_VERSION,
    catalogVersion: OLLAMA_CATALOG_VERSION,
    endpointOrigin: OLLAMA_ENDPOINT_ORIGIN,
    locality: "fixed_os_loopback",
    localityEvidence: OLLAMA_LOCALITY_EVIDENCE,
    runtimeStatus: "unavailable",
    runtimeVersion: "",
    models: [],
    unavailableReason: reason,
    observedAt,
  };
}

export class FixedLoopbackOllamaAdapter implements OllamaLocalAdapter {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    if (!path.startsWith("/api/")) throw new Error("Only Ollama API paths are allowed.");
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetcher(`${OLLAMA_ENDPOINT_ORIGIN}${path}`, {
        ...init,
        redirect: "error",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  async discover(): Promise<OllamaCatalogResult> {
    const observedAt = new Date().toISOString();
    try {
      const versionResponse = await this.request("/api/version", { method: "GET" }, 3_000);
      if (!versionResponse.ok) return unavailableCatalog(`Loopback runtime returned HTTP ${versionResponse.status} for version.`, observedAt);
      const versionBody = await versionResponse.json() as Record<string, unknown>;
      const runtimeVersion = text(versionBody.version);

      const tagsResponse = await this.request("/api/tags", { method: "GET" }, 5_000);
      if (!tagsResponse.ok) return unavailableCatalog(`Loopback runtime returned HTTP ${tagsResponse.status} for installed models.`, observedAt);
      const tagsBody = await tagsResponse.json() as Record<string, unknown>;
      const rawModels = Array.isArray(tagsBody.models) ? tagsBody.models.slice(0, 50) : [];
      const models: LocalModelCatalogEntry[] = [];

      for (const value of rawModels) {
        if (!value || typeof value !== "object") continue;
        const model = value as Record<string, unknown>;
        const name = text(model.name) || text(model.model);
        if (!name) continue;
        let modelCapabilities: LocalModelCapability[] = [];
        try {
          const showResponse = await this.request(
            "/api/show",
            { method: "POST", body: JSON.stringify({ model: name }) },
            5_000,
          );
          if (showResponse.ok) {
            const showBody = await showResponse.json() as Record<string, unknown>;
            modelCapabilities = capabilities(showBody.capabilities);
          }
        } catch {
          // Capability evidence remains empty rather than inferred from a model name or tags response.
        }
        models.push({
          name,
          digest: text(model.digest),
          sizeBytes: finite(model.size) ?? 0,
          modifiedAt: text(model.modified_at),
          capabilities: modelCapabilities,
        });
      }

      return {
        adapterId: OLLAMA_ADAPTER_ID,
        adapterVersion: OLLAMA_ADAPTER_VERSION,
        catalogVersion: OLLAMA_CATALOG_VERSION,
        endpointOrigin: OLLAMA_ENDPOINT_ORIGIN,
        locality: "fixed_os_loopback",
        localityEvidence: OLLAMA_LOCALITY_EVIDENCE,
        runtimeStatus: "healthy",
        runtimeVersion,
        models,
        unavailableReason: "",
        observedAt,
      };
    } catch (error) {
      const reason = error instanceof DOMException && error.name === "AbortError"
        ? "Ollama loopback health check timed out."
        : "Ollama loopback runtime is unavailable.";
      return unavailableCatalog(reason, observedAt);
    }
  }

  async generate(request: OllamaGenerateRequest): Promise<OllamaCompletionResult> {
    if (!request.modelName.trim()) return { status: "unavailable", code: "model_missing", reason: "No local model was selected by policy." };
    try {
      const response = await this.request(
        "/api/generate",
        {
          method: "POST",
          body: JSON.stringify({
            model: request.modelName,
            prompt: request.prompt,
            stream: false,
            options: { num_predict: request.maxOutputTokens },
          }),
        },
        120_000,
      );
      if (!response.ok) {
        return {
          status: "unavailable",
          code: response.status === 404 ? "model_unavailable" : "runtime_error",
          reason: `Ollama loopback generation returned HTTP ${response.status}.`,
        };
      }
      const body = await response.json() as Record<string, unknown>;
      const responseModel = text(body.model);
      if (responseModel && responseModel !== request.modelName) {
        return { status: "unavailable", code: "model_mismatch", reason: "Ollama reported a model different from the policy-selected local model." };
      }
      const content = text(body.response);
      if (!content.trim()) return { status: "unavailable", code: "empty_response", reason: "Ollama returned no proposal content." };
      return {
        status: "proposal",
        content,
        modelName: request.modelName,
        modelDigest: request.modelDigest,
        usage: usageFrom(body),
      };
    } catch (error) {
      return {
        status: "unavailable",
        code: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "runtime_unavailable",
        reason: error instanceof DOMException && error.name === "AbortError"
          ? "Ollama loopback generation timed out."
          : "Ollama loopback runtime or selected local model is unavailable.",
      };
    }
  }
}

export const ollamaAdapter = new FixedLoopbackOllamaAdapter();
