async (page) => {
  return await page.evaluate(() => {
    const rectFor = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        clippedX: rect.left < -1 || rect.right > window.innerWidth + 1
      };
    };
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      canScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      canScrollY: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      regions: {
        shell: rectFor(".app-shell"),
        sidebar: rectFor(".sidebar"),
        main: rectFor(".main"),
        evalLayout: rectFor("#page-eval .layout"),
        evalResult: rectFor("#evalOutput"),
        scorePanel: rectFor(".eval-score-panel")
      }
    };
  });
}
