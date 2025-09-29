(() => {
  if (window.__gcxPageBridgeInstalled) return;
  window.__gcxPageBridgeInstalled = true;

  const capturedStreamChunks = [];
  const capturedCourseWorkChunks = [];

  const ORIGINAL_CALLBACK_KEY = 'GCX_ORIGINAL_AF_INIT_DATA_CALLBACK';

  // Hook AF_initDataCallback to capture stream/coursework data
  const originalCallback = window.AF_initDataCallback;
  window[ORIGINAL_CALLBACK_KEY] = originalCallback;
  window.AF_initDataCallback = function chunkHook(chunk) {
    try {
      if (chunk && typeof chunk === 'object') {
        const key = chunk.key || '';
        const data = chunk.data;
        if (key.includes('stream') && data) {
          capturedStreamChunks.push(chunk);
        } else if (key.includes('CourseWork') && data) {
          capturedCourseWorkChunks.push(chunk);
        }
      }
    } catch (err) {
      console.warn('[GCX] page bridge capture failed', err);
    }
    if (typeof originalCallback === 'function') {
      Reflect.apply(originalCallback, this, arguments);
    }
  };

  function getCapturedData() {
    const streamData = capturedStreamChunks.map((chunk) => chunk.data);
    const courseWorkData = capturedCourseWorkChunks.map((chunk) => chunk.data);
    return { streamData, courseWorkData };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'GCX_REQUEST_STREAM_DATA') {
      const payload = getCapturedData();
      window.postMessage(
        {
          type: 'GCX_STREAM_DATA',
          requestId: data.requestId,
          payload,
        },
        '*'
      );
    }
  });
})();
