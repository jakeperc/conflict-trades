const http = require("http");
const https = require("https");
const { URL } = require("url");

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === "http:" ? http : https;
    const request = client.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 Codex Scenario Dashboard"
        }
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Request failed: ${response.statusCode}`));
          response.resume();
          return;
        }

        let data = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => resolve(data));
      }
    );

    request.on("error", reject);
    request.setTimeout(20000, () => {
      request.destroy(new Error(`Request timed out: ${url}`));
    });
  });
}

async function fetchJson(url) {
  const text = await fetchText(url);
  return JSON.parse(text);
}

module.exports = { fetchText, fetchJson };
