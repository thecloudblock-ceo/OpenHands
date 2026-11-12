import { http as mswHttp, HttpResponse, type HttpResponseResolver } from "msw";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "*",
};

type HttpMethod = "all" | "get" | "post" | "patch" | "put" | "delete";

const preflightResponse = () =>
  new HttpResponse(null, { status: 204, headers: CORS_HEADERS });

const withCors =
  (resolver: HttpResponseResolver): HttpResponseResolver =>
  async (info) => {
    // A preflight never reaches the node's own handler.
    if (info.request.method === "OPTIONS") return preflightResponse();
    const response = await (resolver(info) as Promise<Response | undefined>);
    if (response)
      Object.entries(CORS_HEADERS).forEach(([name, value]) =>
        response.headers.set(name, value),
      );
    return response;
  };

const wrap =
  (method: HttpMethod) => (path: string, resolver: HttpResponseResolver) =>
    mswHttp[method](path, withCors(resolver));

/**
 * msw `http` for nodes on another origin than the jsdom page. msw 3 lets jsdom
 * enforce CORS on mocked responses, so a node answers the way a real agent
 * server does: with CORS headers, and to the preflight of a keyed request.
 */
export const http = {
  all: wrap("all"),
  get: wrap("get"),
  post: wrap("post"),
  patch: wrap("patch"),
  put: wrap("put"),
  delete: wrap("delete"),
};

/** Answers the preflight of routes mocked for one method only. */
export const crossOriginPreflight = mswHttp.options("*", preflightResponse);
