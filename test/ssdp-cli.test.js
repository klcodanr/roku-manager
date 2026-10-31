import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchRequest, parseResponse } from "../src/ssdp-cli.js";

test("builds a Roku SSDP search request", () => {
  assert.equal(
    buildSearchRequest({ host: "239.255.255.250", port: 1900, st: "roku:ecp", mx: 3 }),
    'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nST: roku:ecp\r\nMX: 3\r\n\r\n',
  );
});

test("parses SSDP response headers case-insensitively", () => {
  assert.deepEqual(
    parseResponse("HTTP/1.1 200 OK\r\nST: roku:ecp\r\nLocation: http://192.0.2.1:8060/\r\n\r\n"),
    {
      status: "HTTP/1.1 200 OK",
      headers: { st: "roku:ecp", location: "http://192.0.2.1:8060/" },
    },
  );
});
