import { AwsClient } from "aws4fetch";
import type { PhotoStorage } from "./photo-storage.ts";

const ALLOWED_REGIONS = new Set(["de", "ny", "la", "sg", "syd", "uk", "se", "jh"]);
const REQUEST_TIMEOUT_MS = 15_000;

export interface BunnyStorageConfig {
  zone: string;
  password: string;
  region: string;
  endpoint: string;
}

type StorageFetcher = (request: Request) => Promise<Response>;

export class BunnyStorageError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Photo storage request failed (${status}).`);
    this.name = "BunnyStorageError";
    this.status = status;
  }
}

export class BunnyPhotoStorage implements PhotoStorage {
  private readonly client: AwsClient;
  private readonly baseUrl: string;
  private readonly fetcher: StorageFetcher;

  constructor(config: BunnyStorageConfig, fetcher: StorageFetcher = fetch) {
    if (!config.zone || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(config.zone)) {
      throw new TypeError("Invalid Bunny Storage zone.");
    }
    if (!config.password || !config.password.trim()) {
      throw new TypeError("Bunny Storage password is required.");
    }
    if (!ALLOWED_REGIONS.has(config.region)) {
      throw new TypeError("Invalid Bunny Storage region.");
    }

    const expectedHost = `${config.region}-s3.storage.bunnycdn.com`;
    let endpoint: URL;
    try {
      endpoint = new URL(config.endpoint);
    } catch {
      throw new TypeError("Invalid Bunny Storage endpoint.");
    }
    if (
      endpoint.protocol !== "https:" ||
      endpoint.hostname !== expectedHost ||
      endpoint.port !== "" ||
      endpoint.username !== "" ||
      endpoint.password !== "" ||
      endpoint.pathname !== "/" ||
      endpoint.search !== "" ||
      endpoint.hash !== ""
    ) {
      throw new TypeError("Bunny Storage endpoint must match its HTTPS region endpoint.");
    }

    this.client = new AwsClient({
      accessKeyId: config.zone,
      secretAccessKey: config.password,
      region: config.region,
      service: "s3",
      retries: 0,
    });
    this.baseUrl = `https://${expectedHost}/${encodeURIComponent(config.zone)}`;
    this.fetcher = fetcher;
  }

  async put(
    key: string,
    value: Uint8Array,
    options: { httpMetadata: { contentType: string } },
  ): Promise<unknown> {
    const bytes = new Uint8Array(value.byteLength);
    bytes.set(value);
    const bodyHash = await sha256Hex(bytes);
    const request = new Request(this.objectUrl(key), {
      method: "PUT",
      headers: {
        "Content-Type": options.httpMetadata.contentType,
        "X-Amz-Content-Sha256": bodyHash,
      },
      body: bytes,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const response = await this.fetcher(await this.client.sign(request, requestOptions(request)));
    if (!response.ok) {
      await cancelResponseBody(response);
      throw new BunnyStorageError(response.status);
    }
    await cancelResponseBody(response);
    return undefined;
  }

  async get(key: string): Promise<{ body: ReadableStream<Uint8Array> } | null> {
    const request = new Request(this.objectUrl(key), {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const response = await this.fetcher(await this.client.sign(request, requestOptions(request)));
    if (response.status === 404) {
      await cancelResponseBody(response);
      return null;
    }
    if (!response.ok || !response.body) {
      await cancelResponseBody(response);
      throw new BunnyStorageError(response.status);
    }
    return { body: response.body };
  }

  async delete(key: string): Promise<void> {
    const request = new Request(this.objectUrl(key), {
      method: "DELETE",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const response = await this.fetcher(await this.client.sign(request, requestOptions(request)));
    if (response.status === 404 || response.ok) {
      await cancelResponseBody(response);
      return;
    }
    await cancelResponseBody(response);
    throw new BunnyStorageError(response.status);
  }

  private objectUrl(key: string): string {
    validateObjectKey(key);
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    return `${this.baseUrl}/${encodedKey}`;
  }
}

function validateObjectKey(key: string): void {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    /[\\\u0000-\u001f\u007f-\u009f]/.test(key) ||
    key.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new TypeError("Invalid photo storage key.");
  }
}

function requestOptions(request: Request): RequestInit {
  return { redirect: "error", signal: request.signal };
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Cancellation must not hide the storage result or its safe status-only error.
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const exactBytes = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(exactBytes).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", exactBytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
