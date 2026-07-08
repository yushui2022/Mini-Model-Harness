async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "输出验收" }).click();
  await page.waitForSelector("#evalSuiteInput");

  const readEvalState = async () => page.evaluate(() => {
    const cases = JSON.parse(document.querySelector("#evalDatasetInput")?.value || "[]");
    return {
      suiteOptions: Array.from(document.querySelectorAll("#evalSuiteInput option")).map((option) => option.textContent.trim()),
      setOptions: Array.from(document.querySelectorAll("#evalSetInput option")).map((option) => option.textContent.trim()),
      selectedSuite: document.querySelector("#evalSuiteInput")?.selectedOptions[0]?.textContent.trim(),
      selectedSet: document.querySelector("#evalSetInput")?.selectedOptions[0]?.textContent.trim(),
      caseCount: cases.length,
      caseIds: cases.map((item) => item.id),
      checks: Array.from(new Set(cases.map((item) => item.check))),
      families: Array.from(new Set(cases.map((item) => item.family)))
    };
  });

  const initial = await readEvalState();
  await page.selectOption("#evalSuiteInput", "instruction_following");
  await page.waitForTimeout(150);
  const instruction = await readEvalState();
  await page.selectOption("#evalSuiteInput", "tool_calling");
  await page.waitForTimeout(150);
  const tool = await readEvalState();

  return { initial, instruction, tool };
}
