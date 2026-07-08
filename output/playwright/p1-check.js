async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "输出验收" }).click();
  await page.waitForSelector("#evalSuiteInput");

  const read = async () => page.evaluate(() => {
    const cases = JSON.parse(document.querySelector("#evalDatasetInput")?.value || "[]");
    return {
      options: Array.from(document.querySelectorAll("#evalSuiteInput option")).map((option) => option.textContent.trim()),
      activeMode: document.querySelector("#evalRunModeToggle button.active")?.textContent.trim() || "",
      meta: document.querySelector("#evalMeta")?.textContent || "",
      totalCases: cases.length,
      suites: Array.from(new Set(cases.map((item) => item.suite || ""))).filter(Boolean),
      hasMultiTurnTurns: cases.some((item) => Array.isArray(item.turns) && item.turns.length > 0),
      checks: Array.from(new Set(cases.map((item) => item.check))).filter(Boolean)
    };
  });

  await page.selectOption("#evalSuiteInput", "truthfulness");
  await page.waitForTimeout(100);
  const truth = await read();
  await page.selectOption("#evalSuiteInput", "multi_turn");
  await page.waitForTimeout(100);
  const multi = await read();
  await page.getByRole("button", { name: "完整" }).click();
  await page.waitForTimeout(150);
  const full = await read();

  return { truth, multi, full };
}
