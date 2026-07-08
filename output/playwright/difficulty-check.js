async (page) => {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "输出验收" }).click();
  await page.waitForSelector("#evalSuiteInput");
  await page.selectOption("#evalSuiteInput", "instruction_following");
  await page.waitForTimeout(100);

  const readIds = async () => page.evaluate(() => JSON.parse(document.querySelector("#evalDatasetInput").value).map((item) => item.id));
  await page.getByRole("button", { name: "低" }).click();
  await page.waitForTimeout(100);
  const easy = await readIds();
  await page.getByRole("button", { name: "中" }).click();
  await page.waitForTimeout(100);
  const medium = await readIds();
  await page.getByRole("button", { name: "高" }).click();
  await page.waitForTimeout(100);
  const hard = await readIds();

  return { easy, medium, hard };
}
