async (page) => {
  return await page.evaluate(() => {
    const output = document.querySelector("#evalOutput");
    return {
      events: window.__miniHarnessStreamEvents || [],
      evalMeta: document.querySelector("#evalMeta")?.textContent || "",
      summary: document.querySelector("#evalSummary")?.textContent || "",
      caseCount: output?.querySelectorAll(".eval-case").length || 0,
      latestCount: output?.querySelectorAll(".eval-case.latest").length || 0,
      progressText: output?.querySelector(".eval-progress-inline")?.textContent || "",
      scoreText: output?.querySelector(".score-ring")?.textContent || "",
      failureTags: Array.from(output?.querySelectorAll(".tag-chip") || []).map((node) => node.textContent),
      text: output?.textContent || ""
    };
  });
}
