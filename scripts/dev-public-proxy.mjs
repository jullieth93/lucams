import http from "node:http";

const listenPort = 4100;
const appPort = 4000;
const supabasePort = 54321;
const supabasePrefixes = ["/auth/v1/", "/rest/v1/", "/storage/v1/"];

const server = http.createServer((request, response) => {
  const path = request.url ?? "/";
  const toSupabase = supabasePrefixes.some((prefix) => path.startsWith(prefix));
  const port = toSupabase ? supabasePort : appPort;
  const headers = { ...request.headers };
  headers.host = toSupabase ? `127.0.0.1:${supabasePort}` : request.headers.host;
  headers["x-forwarded-host"] = request.headers.host;
  headers["x-forwarded-proto"] = "https";

  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port,
      path,
      method: request.method,
      headers,
      timeout: 120_000,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  upstream.on("timeout", () => upstream.destroy(new Error("upstream timeout")));
  upstream.on("error", () => {
    if (!response.headersSent)
      response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end("El servicio LOCAL no está disponible.\n");
  });
  request.on("aborted", () => upstream.destroy());
  request.pipe(upstream);
});

server.listen(listenPort, "127.0.0.1", () => {
  console.log(`Proxy LOCAL público en 127.0.0.1:${listenPort}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
