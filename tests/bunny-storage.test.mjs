import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { BunnyPhotoStorage, BunnyStorageError } from "../lib/bunny-storage.ts";

const config = {
  zone: "aviation-arcade-website",
  password: "test-only-bunny-password",
  region: "de",
  endpoint: "https://de-s3.storage.bunnycdn.com",
};

function storageWith(fetcher) {
  return new BunnyPhotoStorage(config, fetcher);
}

test("PUT signs with Bunny's zone and region and uploads the exact byte view", async () => {
  let request;
  const storage = storageWith(async (signedRequest) => {
    request = signedRequest;
    return new Response(null, { status: 200 });
  });
  const backing = new Uint8Array([99, 1, 2, 3, 88]);
  const bytes = backing.subarray(1, 4);

  await storage.put("submissions/a plane/photo #1.jpg", bytes, {
    httpMetadata: { contentType: "image/jpeg" },
  });

  assert.equal(request.method, "PUT");
  assert.equal(
    request.url,
    "https://de-s3.storage.bunnycdn.com/aviation-arcade-website/submissions/a%20plane/photo%20%231.jpg",
  );
  assert.match(
    request.headers.get("authorization"),
    /^AWS4-HMAC-SHA256 Credential=aviation-arcade-website\/\d{8}\/de\/s3\/aws4_request,/,
  );
  assert.equal(request.headers.get("content-type"), "image/jpeg");
  assert.equal(request.headers.get("x-amz-content-sha256"), createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(Array.from(new Uint8Array(await request.arrayBuffer())), [1, 2, 3]);
  assert.equal(request.redirect, "error");
  assert.ok(request.signal);
});

test("GET returns a readable response stream and maps only 404 to missing", async () => {
  const expectedBytes = new Uint8Array([4, 5, 6]);
  const storage = storageWith(async (request) => {
    assert.equal(request.method, "GET");
    return new Response(expectedBytes, { status: 200 });
  });
  const object = await storage.get("photos/plane.webp");
  assert.ok(object?.body instanceof ReadableStream);
  assert.deepEqual(Array.from(new Uint8Array(await new Response(object.body).arrayBuffer())), [4, 5, 6]);

  const missing = storageWith(async () => new Response("private provider detail", { status: 404 }));
  assert.equal(await missing.get("photos/missing.webp"), null);
});

test("upstream failures retain status without exposing provider response bodies", async () => {
  for (const status of [403, 500]) {
    let attempts = 0;
    const storage = storageWith(async () => {
      attempts += 1;
      return new Response("secret provider response", { status });
    });
    await assert.rejects(storage.get("photos/private.jpg"), (error) => {
      assert.ok(error instanceof BunnyStorageError);
      assert.equal(error.status, status);
      assert.match(error.message, new RegExp(`\\(${status}\\)`));
      assert.doesNotMatch(error.message, /secret provider response|password|aviation-arcade/);
      return true;
    });
    assert.equal(attempts, 1);
  }
});

test("DELETE treats success and missing objects as complete, and surfaces other statuses", async () => {
  for (const status of [204, 404]) {
    const storage = storageWith(async (request) => {
      assert.equal(request.method, "DELETE");
      return new Response(null, { status });
    });
    await storage.delete("photos/plane.jpg");
  }

  const failed = storageWith(async () => new Response("do not expose", { status: 500 }));
  await assert.rejects(failed.delete("photos/plane.jpg"), (error) => {
    assert.ok(error instanceof BunnyStorageError);
    assert.equal(error.status, 500);
    assert.doesNotMatch(error.message, /do not expose/);
    return true;
  });
});

test("constructor rejects invalid Bunny region endpoints and empty credentials", () => {
  const invalidConfigs = [
    { ...config, password: "" },
    { ...config, region: "us-east-1" },
    { ...config, region: "br", endpoint: "https://br-s3.storage.bunnycdn.com" },
    { ...config, endpoint: "http://de-s3.storage.bunnycdn.com" },
    { ...config, endpoint: "https://de-s3.storage.bunnycdn.com/path" },
    { ...config, endpoint: "https://de-s3.storage.bunnycdn.com?x=1" },
    { ...config, endpoint: "https://user:pass@de-s3.storage.bunnycdn.com" },
    { ...config, endpoint: "https://ny-s3.storage.bunnycdn.com" },
    { ...config, endpoint: "https://de-s3.storage.bunny.net" },
  ];
  for (const invalid of invalidConfigs) {
    assert.throws(() => new BunnyPhotoStorage(invalid, async () => new Response()), TypeError);
  }
});

test("discarded response bodies are canceled while successful GET streams stay open", async () => {
  const trackedResponse = (status, body = new Uint8Array([9])) => {
    let cancellations = 0;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(body);
      },
      cancel() {
        cancellations += 1;
      },
    });
    return {
      response: new Response(stream, { status }),
      cancellations: () => cancellations,
    };
  };

  const putBody = trackedResponse(200);
  await storageWith(async () => putBody.response).put("photos/put.jpg", new Uint8Array([1]), {
    httpMetadata: { contentType: "image/jpeg" },
  });
  assert.equal(putBody.cancellations(), 1);

  const missingBody = trackedResponse(404);
  assert.equal(await storageWith(async () => missingBody.response).get("photos/missing.jpg"), null);
  assert.equal(missingBody.cancellations(), 1);

  const errorBody = trackedResponse(500);
  await assert.rejects(storageWith(async () => errorBody.response).get("photos/error.jpg"), BunnyStorageError);
  assert.equal(errorBody.cancellations(), 1);

  const deleteBody = trackedResponse(404);
  await storageWith(async () => deleteBody.response).delete("photos/deleted.jpg");
  assert.equal(deleteBody.cancellations(), 1);

  const streamedBody = trackedResponse(200);
  const object = await storageWith(async () => streamedBody.response).get("photos/live.jpg");
  assert.equal(streamedBody.cancellations(), 0);
  await object.body.cancel();
  assert.equal(streamedBody.cancellations(), 1);
});

test("object keys reject path traversal, controls, and backslashes", async () => {
  const storage = storageWith(async () => new Response(new Uint8Array([1]), { status: 200 }));
  for (const key of ["", "../secret", "photos/../secret", ".", "photos\\secret", "bad\nkey"]) {
    await assert.rejects(storage.get(key), TypeError);
  }

  await storage.get("photos/100%/café.jpg");
});
