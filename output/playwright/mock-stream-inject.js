async (page) => {
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.__miniHarnessStreamEvents = [];
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input && input.url;
      if (!String(url).includes("/api/eval/stream")) {
        return originalFetch(input, init);
      }

      const encoder = new TextEncoder();
      const passCase = {
        id: "mock_json_pass",
        family: "JSON 结构",
        check: "json_schema",
        input: "只返回 JSON",
        expected: { status: "ok" },
        output: "{\"status\":\"ok\"}",
        parsedOutput: { status: "ok" },
        passed: true,
        score: 1,
        latencyMs: 120,
        failureTags: [],
        scoreBreakdown: { format: 1, schema: 1, content: 1, loop: 1 },
        diagnostics: { rawLength: 15, jsonParseable: true, repeatedLineCount: 0, maxTokenLikelyHit: false },
        reason: "json valid"
      };
      const failCase = {
        id: "mock_json_fail",
        family: "JSON 结构",
        check: "json_schema",
        input: "只返回 JSON",
        expected: { status: "ok" },
        output: "status ok",
        parsedOutput: null,
        passed: false,
        score: 0,
        latencyMs: 180,
        failureTags: ["JSON_PARSE_ERROR"],
        scoreBreakdown: { format: 0, schema: 0, content: 0, loop: 1 },
        diagnostics: { rawLength: 9, jsonParseable: false, repeatedLineCount: 0, maxTokenLikelyHit: false },
        reason: "json parse: unexpected token"
      };
      const events = [
        {
          delay: 0,
          payload: {
            type: "start",
            total: 2,
            startedAt: new Date().toISOString(),
            profile: { provider: "mock", model: "mock-3b" }
          }
        },
        {
          delay: 300,
          payload: {
            type: "case",
            index: 1,
            total: 2,
            case: passCase,
            summary: {
              total: 2,
              completed: 1,
              passed: 1,
              failed: 0,
              passRate: 1,
              avgScore: 1,
              latencyMs: 120,
              failureTagCounts: {}
            }
          }
        },
        {
          delay: 700,
          payload: {
            type: "case",
            index: 2,
            total: 2,
            case: failCase,
            summary: {
              total: 2,
              completed: 2,
              passed: 1,
              failed: 1,
              passRate: 0.5,
              avgScore: 0.5,
              latencyMs: 300,
              failureTagCounts: { JSON_PARSE_ERROR: 1 }
            }
          }
        },
        {
          delay: 900,
          payload: {
            type: "done",
            runId: "mock_run_stream",
            summary: {
              total: 2,
              completed: 2,
              passed: 1,
              failed: 1,
              passRate: 0.5,
              avgScore: 0.5,
              latencyMs: 300,
              failureTagCounts: { JSON_PARSE_ERROR: 1 }
            },
            cases: [passCase, failCase]
          }
        }
      ];

      return Promise.resolve(new Response(
        new ReadableStream({
          start(controller) {
            for (const event of events) {
              setTimeout(() => {
                window.__miniHarnessStreamEvents.push(event.payload.type);
                controller.enqueue(encoder.encode(`${JSON.stringify(event.payload)}\n`));
                if (event.payload.type === "done") controller.close();
              }, event.delay);
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/x-ndjson" } }
      ));
    };
  });
}
