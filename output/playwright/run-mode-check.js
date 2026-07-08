async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "输出验收" }).click();
  await page.waitForSelector("#evalRunModeToggle");

  const read = async () => page.evaluate(() => {
    const cases = JSON.parse(document.querySelector("#evalDatasetInput")?.value || "[]");
    return {
      activeMode: document.querySelector("#evalRunModeToggle button.active")?.textContent.trim() || "",
      caseLimit: document.querySelector("#evalCaseLimitInput")?.value || "",
      meta: document.querySelector("#evalMeta")?.textContent || "",
      summary: document.querySelector("#evalSummary")?.textContent || "",
      system: document.querySelector("#evalSystemInput")?.value || "",
      totalCases: cases.length,
      suites: Array.from(new Set(cases.map((item) => item.suite || ""))).filter(Boolean),
      checks: Array.from(new Set(cases.map((item) => item.check))).filter(Boolean)
    };
  });

  await page.getByRole("button", { name: "快速" }).click();
  await page.waitForTimeout(150);
  const quick = await read();
  await page.getByRole("button", { name: "标准" }).click();
  await page.waitForTimeout(150);
  const standard = await read();
  await page.getByRole("button", { name: "完整" }).click();
  await page.waitForTimeout(150);
  const full = await read();
  return { quick, standard, full };
}
