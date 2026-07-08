async (page) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.__miniHarnessFallbackCalls = [];
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input && input.url;
      if (String(url).includes("/api/eval/stream")) {
        window.__miniHarnessFallbackCalls.push("stream-404");
        return Promise.resolve(new Response(JSON.stringify({ error: "stream unavailable" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        }));
      }
      if (String(url).includes("/api/eval")) {
        window.__miniHarnessFallbackCalls.push("legacy-eval");
        return Promise.resolve(new Response(JSON.stringify({
          runId: "mock_legacy_eval",
          summary: {
            total: 1,
            completed: 1,
            passed: 1,
            failed: 0,
            passRate: 1,
            avgScore: 1,
            latencyMs: 88,
            failureTagCounts: {}
          },
          cases: [{
            id: "mock_legacy_case",
            family: "JSON 结构",
            check: "json_schema",
            input: "只返回 JSON",
            expected: { status: "ok" },
            output: "{\"status\":\"ok\"}",
            parsedOutput: { status: "ok" },
            passed: true,
            score: 1,
            latencyMs: 88,
            failureTags: [],
            scoreBreakdown: { format: 1, schema: 1, content: 1, loop: 1 },
            diagnostics: { rawLength: 15, jsonParseable: true, repeatedLineCount: 0, maxTokenLikelyHit: false },
            reason: "json valid"
          }]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        }));
      }
      return originalFetch(input, init);
    };
  });

  await page.getByRole("button", { name: "运行验收" }).click();
  await page.waitForTimeout(500);
  return await page.evaluate(() => ({
    calls: window.__miniHarnessFallbackCalls || [],
    meta: document.querySelector("#evalMeta")?.textContent || "",
    caseCount: document.querySelectorAll("#evalOutput .eval-case").length,
    text: document.querySelector("#evalOutput")?.textContent || ""
  }));
}
