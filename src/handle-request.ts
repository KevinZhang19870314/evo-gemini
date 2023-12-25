import { NextRequest } from "next/server";
import { pipeline } from "stream/promises"; // Node.js streams
import { ReadableStream, ReadableStreamDefaultReader } from 'web-streams-polyfill/ponyfill';

const pickHeaders = (headers: Headers, keys: (string | RegExp)[]): Headers => {
  const picked = new Headers();
  for (const key of headers.keys()) {
    if (keys.some((k) => (typeof k === "string" ? k === key : k.test(key)))) {
      const value = headers.get(key);
      if (typeof value === "string") {
        picked.set(key, value);
      }
    }
  }
  return picked;
};

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "*",
  "access-control-allow-headers": "*",
};

export default async function handleRequest(request: NextRequest & { nextUrl?: URL }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: CORS_HEADERS,
    });
  }

  const { pathname, searchParams } = request.nextUrl ? request.nextUrl : new URL(request.url);

  const url = new URL(pathname, "https://generativelanguage.googleapis.com");
  searchParams.delete("_path");

  searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });

  const headers = pickHeaders(request.headers, ["content-type", "x-goog-api-client", "x-goog-api-key"]);

  // Check if request.body is not null before using it
  const requestBodyStream = request.body
    ? new ReadableStream({
        async start(controller) {
          const reader = request.body!.getReader();

          async function read() {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
            } else {
              controller.enqueue(value);
              read();
            }
          }

          read();
        },
        async cancel(reason) {
          console.error("Request body stream canceled:", reason);
        },
      })
    : null;

  const response = await fetch(url, {
    body: requestBodyStream,
    method: request.method,
    headers,
  });

  // Check if response.body is not null before using it
  const responseBodyStream = response.body
    ? new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();

          async function read() {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
            } else {
              controller.enqueue(value);
              read();
            }
          }

          read();
        },
        async cancel(reason) {
          console.error("Response body stream canceled:", reason);
        },
      })
    : null;

  const responseHeaders = {
    ...CORS_HEADERS,
    ...Object.fromEntries(response.headers),
  };

  // Pipe the response body stream to the original response object if not null
  if (responseBodyStream) {
    const writer = response.body!.getWritable();
    responseBodyStream.pipeTo(writer);
  }

  return new Response(null, {
    headers: responseHeaders,
    status: response.status,
  });
}
