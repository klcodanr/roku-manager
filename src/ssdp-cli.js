import dgram from "node:dgram";

const DEFAULT_HOST = "239.255.255.250";
const DEFAULT_PORT = 1900;
const DEFAULT_ST = "roku:ecp";
const DEFAULT_MX = 3;
const DEFAULT_TIMEOUT = 5_000;

export function buildSearchRequest({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  st = DEFAULT_ST,
  mx = DEFAULT_MX,
}) {
  return [
    "M-SEARCH * HTTP/1.1",
    `HOST: ${host}:${port}`,
    'MAN: "ssdp:discover"',
    `ST: ${st}`,
    `MX: ${mx}`,
    "",
    "",
  ].join("\r\n");
}

export function parseResponse(message) {
  const lines = message.toString().split(/\r?\n/);
  const status = lines.shift() || "";
  const headers = {};
  for (const line of lines) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    headers[line.slice(0, separator).toLowerCase()] = line.slice(separator + 1).trim();
  }
  return { status, headers };
}

export async function discover({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  st = DEFAULT_ST,
  mx = DEFAULT_MX,
  timeout = DEFAULT_TIMEOUT,
  networkInterface,
} = {}) {
  const socket = dgram.createSocket("udp4");
  const request = Buffer.from(buildSearchRequest({ host, port, st, mx }));
  const responses = [];

  return new Promise((resolve, reject) => {
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve(responses);
    };

    socket.once("error", finish);
    socket.on("message", (message, rinfo) => {
      responses.push({
        address: rinfo.address,
        port: rinfo.port,
        raw: message.toString(),
        ...parseResponse(message),
      });
    });
    socket.bind(0, networkInterface, () => {
      socket.setBroadcast(true);
      socket.setMulticastTTL(4);
      socket.send(request, port, host, (error) => {
        if (error) finish(error);
      });
    });
    timer = setTimeout(() => finish(), timeout);
  });
}

function usage() {
  return `Usage: npm run ssdp -- [options]

Send a raw Roku SSDP M-SEARCH request and print responses.

Options:
  --st <value>         Search target (default: ${DEFAULT_ST})
  --mx <seconds>       Requested response window (default: ${DEFAULT_MX})
  --timeout <ms>       How long to collect responses (default: ${DEFAULT_TIMEOUT})
  --host <address>     SSDP multicast address (default: ${DEFAULT_HOST})
  --port <number>      SSDP port (default: ${DEFAULT_PORT})
  --interface <name>   Local network interface to bind
  --json               Print parsed responses as JSON
  --help               Show this help
`;
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") return { help: true };
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    const match = /^(--[^=]+)(?:=(.*))?$/.exec(arg);
    if (
      !match ||
      !["--st", "--mx", "--timeout", "--host", "--port", "--interface"].includes(match[1])
    ) {
      throw new Error(`Unknown option: ${arg}`);
    }
    const value = match[2] ?? args[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${match[1]}`);
    options[match[1].slice(2).replace("-", "")] = value;
  }
  for (const key of ["mx", "timeout", "port"]) {
    if (options[key] !== undefined) options[key] = Number(options[key]);
    if (options[key] !== undefined && !Number.isFinite(options[key]))
      throw new Error(`Invalid ${key}`);
  }
  return options;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
    } else {
      const responses = await discover(options);
      if (options.json) {
        console.log(JSON.stringify(responses, null, 2));
      } else {
        for (const response of responses) {
          process.stdout.write(`\n--- ${response.address}:${response.port} ---\n${response.raw}`);
        }
        process.stdout.write(`\nReceived ${responses.length} response(s).\n`);
      }
    }
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 1;
  }
}
