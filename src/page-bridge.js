(() => {
  if (window.__gcxPageBridgeInstalled) return;
  window.__gcxPageBridgeInstalled = true;

  function collectStreamDomHtml() {
    const selectors = [
      'div[jscontroller="h38nBf"][data-stream-item-id]',
      'div[jscontroller="dk8rTb"][data-stream-item-id]',
      'div[data-stream-item-id][jsmodel*="N2jS6b"]',
    ];
    const nodes = new Set();
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        if (node instanceof HTMLElement) {
          nodes.add(node);
        }
      });
    });
    return Array.from(nodes).map((node) => node.outerHTML);
  }

  function collectStreamHtmlFromContext() {
    const context = window.pageContext;
    if (!context || typeof context !== "object") {
      return [];
    }

    const seenObjects = new Set();
    const htmlSet = new Set();
    const stack = [context];

    while (stack.length) {
      const current = stack.pop();
      if (current == null) continue;
      const type = typeof current;
      if (type === "string") {
        if (current.includes("data-stream-item-id")) {
          htmlSet.add(current);
        }
        continue;
      }
      if (type !== "object") continue;
      if (seenObjects.has(current)) continue;
      seenObjects.add(current);

      if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i += 1) {
          stack.push(current[i]);
        }
        continue;
      }

      const values = Object.values(current);
      for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (value == null) continue;
        const valueType = typeof value;
        if (valueType === "string") {
          if (value.includes("data-stream-item-id")) {
            htmlSet.add(value);
          }
          continue;
        }
        if (valueType === "object") {
          stack.push(value);
        }
      }
    }

    return Array.from(htmlSet);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type !== "GCX_REQUEST_STREAM_DATA") return;
    const mode = data.mode === "context" ? "context" : "dom";

    const htmlList =
      mode === "context" ? collectStreamHtmlFromContext() : collectStreamDomHtml();

    window.postMessage(
      {
        type: "GCX_STREAM_DATA",
        requestId: data.requestId,
        mode,
        payload: { html: Array.isArray(htmlList) ? htmlList : [] },
      },
      "*"
    );
  });
})();
