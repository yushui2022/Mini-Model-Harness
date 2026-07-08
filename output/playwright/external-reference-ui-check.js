async (page) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("http://127.0.0.1:4173", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("miniHarness.language", "zh");
    localStorage.setItem(
      "miniHarness.evalConfig",
      JSON.stringify({
        runMode: "quick",
        suiteId: "json_extraction",
        setId: "business",
        difficulty: "medium",
        caseLimit: "5"
      })
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.click('.nav-item[data-page="eval"]');
  await page.waitForSelector("#evalSuiteInput");

  const readState = async () => page.evaluate(() => {
    const cases = JSON.parse(document.querySelector("#evalDatasetInput")?.value || "[]");
    return {
      suiteOptions: Array.from(document.querySelectorAll("#evalSuiteInput option")).map((option) => ({
        value: option.value,
        label: option.textContent.trim()
      })),
      setOptions: Array.from(document.querySelectorAll("#evalSetInput option")).map((option) => ({
        value: option.value,
        label: option.textContent.trim()
      })),
      activeMode: document.querySelector("#evalRunModeToggle button.active")?.dataset.runMode || "",
      meta: document.querySelector("#evalMeta")?.textContent || "",
      totalCases: cases.length,
      suites: Array.from(new Set(cases.map((item) => item.suite || ""))).filter(Boolean),
      sets: Array.from(new Set(cases.map((item) => item.set || ""))).filter(Boolean),
      sources: Array.from(new Set(cases.map((item) => item.source || ""))).filter(Boolean),
      checks: Array.from(new Set(cases.map((item) => item.check || ""))).filter(Boolean),
      overflowX: document.documentElement.scrollWidth - window.innerWidth
    };
  });
  const assert = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };

  const initial = await readState();
  await page.selectOption("#evalSuiteInput", "external_reference");
  await page.waitForTimeout(150);
  const externalInitial = await readState();
  await page.selectOption("#evalSetInput", "gsm8k_lite");
  await page.selectOption("#evalCaseLimitInput", "all");
  await page.click('#evalDifficultyToggle button[data-difficulty="hard"]');
  await page.waitForTimeout(150);
  const externalGsm = await readState();

  await page.screenshot({
    path: "output/playwright/external-reference-desktop-1366.png",
    fullPage: true
  });

  await page.click('#evalRunModeToggle button[data-run-mode="standard"]');
  await page.waitForTimeout(150);
  const standard = await readState();
  await page.click('#evalRunModeToggle button[data-run-mode="full"]');
  await page.waitForTimeout(150);
  const full = await readState();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobile = await readState();
  await page.screenshot({
    path: "output/playwright/external-reference-mobile-390.png",
    fullPage: true
  });

  const expectedSets = [
    "mmlu_pro_lite",
    "gsm8k_lite",
    "bbh_lite",
    "humaneval_lite",
    "mbpp_lite",
    "wildbench_lite"
  ];

  assert(initial.suiteOptions.at(-1)?.value === "external_reference", "external_reference should be the last suite option");
  assert(
    expectedSets.every((setId) => externalInitial.setOptions.some((option) => option.value === setId)),
    "external_reference should expose all expected lite sets"
  );
  assert(externalInitial.suites.includes("external_reference"), "manual external selection should build external cases");
  assert(externalGsm.sets.includes("GSM8K-lite"), "GSM8K-lite set should be selectable");
  assert(externalGsm.totalCases === 3, "GSM8K-lite hard/all should expose three ordered cases");
  assert(standard.suites.length === 6, "standard mode should stay at core 6 classes");
  assert(!standard.suites.includes("external_reference"), "standard mode should not include external_reference");
  assert(full.suites.length === 8, "full mode should stay at 8 model-capability classes");
  assert(!full.suites.includes("external_reference"), "full mode should not include external_reference");
  assert(initial.overflowX <= 1 && externalGsm.overflowX <= 1 && mobile.overflowX <= 1, "page should not overflow horizontally");
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);
  assert(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);

  return {
    initial,
    externalInitial,
    externalGsm,
    standard,
    full,
    mobile,
    consoleErrors,
    pageErrors
  };
}
