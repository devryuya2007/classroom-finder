(() => {
  if (window.__gcxPageBridgeInstalled) return;
  window.__gcxPageBridgeInstalled = true;

  function collectStreamHtml() {
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

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type !== "GCX_REQUEST_STREAM_DOM") return;

    const payload = collectStreamHtml();
    window.postMessage(
      {
        type: "GCX_STREAM_DOM",
        requestId: data.requestId,
        payload,
      },
      "*"
    );
  });
})();
