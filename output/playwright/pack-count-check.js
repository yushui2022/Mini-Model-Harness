async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "输出验收" }).click();
  await page.waitForSelector("#evalSuiteInput");

  const countSuite = async (suiteId) => {
    await page.selectOption("#evalSuiteInput", suiteId);
    await page.selectOption("#evalCaseLimitInput", "all");
    await page.waitForTimeout(100);
    const base = await page.evaluate(() => ({
      suite: document.querySelector("#evalSuiteInput")?.selectedOptions[0]?.textContent.trim(),
      sets: Array.from(document.querySelectorAll("#evalSetInput option")).map((option) => ({
        id: option.value,
        title: option.textContent.trim()
      }))
    }));
    const counts = [];
    for (const set of base.sets) {
      await page.selectOption("#evalSetInput", set.id);
      await page.waitForTimeout(100);
      counts.push({
        title: set.title,
        cases: await page.evaluate(() => JSON.parse(document.querySelector("#evalDatasetInput").value).length)
      });
    }
    return {
      suite: base.suite,
      sets: counts,
      totalCases: counts.reduce((sum, item) => sum + item.cases, 0)
    };
  };

  return {
    instruction: await countSuite("instruction_following"),
    tool: await countSuite("tool_calling")
  };
}
