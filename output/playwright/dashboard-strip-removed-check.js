async (page) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("http://127.0.0.1:4173", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("miniHarness.language", "zh");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#page-control.active");

  const desktop = await page.evaluate(() => ({
    hasDashboardStrip: Boolean(document.querySelector(".dashboard-strip")),
    firstPanelTitle: document.querySelector("#page-control .panel h3")?.textContent.trim() || "",
    overflowX: document.documentElement.scrollWidth - window.innerWidth
  }));

  await page.screenshot({
    path: "output/playwright/dashboard-no-strip-desktop-1366.png",
    fullPage: true
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  const mobile = await page.evaluate(() => ({
    hasDashboardStrip: Boolean(document.querySelector(".dashboard-strip")),
    firstPanelTitle: document.querySelector("#page-control .panel h3")?.textContent.trim() || "",
    overflowX: document.documentElement.scrollWidth - window.innerWidth
  }));

  await page.screenshot({
    path: "output/playwright/dashboard-no-strip-mobile-390.png",
    fullPage: true
  });

  if (desktop.hasDashboardStrip || mobile.hasDashboardStrip) {
    throw new Error("dashboard-strip should be removed");
  }
  if (desktop.overflowX > 1 || mobile.overflowX > 1) {
    throw new Error(`horizontal overflow: desktop ${desktop.overflowX}, mobile ${mobile.overflowX}`);
  }
  if (consoleErrors.length || pageErrors.length) {
    throw new Error(`browser errors: ${consoleErrors.concat(pageErrors).join(" | ")}`);
  }

  return { desktop, mobile, consoleErrors, pageErrors };
}
