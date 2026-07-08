async (page) => {
  await page.evaluate(() => {
    document.querySelector("#evalOutput")?.scrollIntoView({ block: "start" });
  });
}
