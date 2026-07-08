async (page) => {
  const baseline = {
    id: "run_baseline",
    createdAt: "2026-07-08T00:00:00.000Z",
    type: "eval",
    title: "Baseline",
    profile: { model: "mock-3b" },
    summary: {
      total: 3,
      passed: 2,
      failed: 1,
      passRate: 2 / 3,
      avgScore: 0.83,
      latencyMs: 300,
      failureTagCounts: { INVALID_ENUM: 1 }
    },
    result: {
      cases: [
        {
          id: "json_case",
          suite: "json_extraction",
          family: "JSON 结构",
          passed: false,
          score: 0.5,
          output: "{\"status\":\"bad\"}",
          failureTags: ["INVALID_ENUM"]
        },
        {
          id: "tool_case",
          suite: "tool_calling",
          family: "工具选择",
          passed: true,
          score: 1,
          output: "{\"tool\":\"search_order\"}",
          failureTags: []
        },
        {
          id: "route_case",
          suite: "intent_routing",
          family: "意图标签",
          passed: true,
          score: 1,
          output: "refund",
          failureTags: []
        }
      ]
    }
  };
  const candidate = {
    id: "run_candidate",
    createdAt: "2026-07-08T00:02:00.000Z",
    type: "eval",
    title: "Candidate",
    profile: { model: "mock-3b" },
    summary: {
      total: 3,
      passed: 2,
      failed: 1,
      passRate: 2 / 3,
      avgScore: 0.8,
      latencyMs: 360,
      failureTagCounts: { TOOL_ARGUMENT_MISSING: 1 }
    },
    result: {
      cases: [
        {
          id: "json_case",
          suite: "json_extraction",
          family: "JSON 结构",
          passed: true,
          score: 1,
          output: "{\"status\":\"ok\"}",
          failureTags: []
        },
        {
          id: "tool_case",
          suite: "tool_calling",
          family: "工具选择",
          passed: false,
          score: 0.4,
          output: "{\"tool\":\"search_order\",\"arguments\":{}}",
          failureTags: ["TOOL_ARGUMENT_MISSING"]
        },
        {
          id: "route_case",
          suite: "intent_routing",
          family: "意图标签",
          passed: true,
          score: 1,
          output: "refund",
          failureTags: []
        }
      ]
    }
  };

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate((runs) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input && input.url;
      if (String(url).endsWith("/api/runs")) {
        return Promise.resolve(new Response(JSON.stringify({ runs }), {
          status: 200,
          headers: { "content-type": "application/json" }
        }));
      }
      return originalFetch(input, init);
    };
  }, [candidate, baseline]);

  await page.getByRole("button", { name: "前后对比" }).click();
  await page.waitForFunction(() => document.querySelectorAll("#compareRunA option").length >= 2);
  await page.selectOption("#compareRunA", "run_baseline");
  await page.selectOption("#compareRunB", "run_candidate");
  await page.getByRole("button", { name: "比较" }).click();
  await page.waitForSelector("#downloadCompareReportBtn");

  return await page.evaluate(({ baseline, candidate }) => {
    const output = document.querySelector("#compareOutput");
    const markdown = typeof buildRunComparison === "function" && typeof createCompareMarkdown === "function"
      ? createCompareMarkdown(buildRunComparison(baseline, candidate))
      : "";
    return {
      text: output?.textContent || "",
      classRows: output?.querySelectorAll(".compare-class-row").length || 0,
      markdownButton: Boolean(document.querySelector("#downloadCompareReportBtn")),
      markdownWorks: markdown.includes("Fixed Cases") &&
        markdown.includes("Regressed Cases") &&
        markdown.includes("TOOL_ARGUMENT_MISSING"),
      canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  }, { baseline, candidate });
}
