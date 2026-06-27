// UI constants for content script

export const STYLE_ID = "gcx-sarch-style";
export const STYLE_PATH = "src/gcx-topbar.css";
export const TOPBAR_WRAP = "gcx-topbar";
export const TOPBAR_INPUT = "gcx-topbar-input";
export const TOPBAR_ID = "gcx-topbar-overlay";
export const EXPANDED_CLASS = "is-expanded";
export const REFRESH_BUTTON_SELECTOR = ".gcx-refresh-btn";
export const REFRESH_ERROR_CLASS = "is-error";
export const REFRESH_ERROR_DURATION_MS = 1500;
export const SUGGESTION_LIMIT = 20;

export const SVG_NS = "http://www.w3.org/2000/svg";
export const ICON_PATH_DATA = [
  "M172.625,102.4c-42.674,0-77.392,34.739-77.392,77.438c0,5.932,4.806,10.74,10.733,10.74c5.928,0,10.733-4.808,10.733-10.74c0-30.856,25.088-55.959,55.926-55.959c5.928,0,10.733-4.808,10.733-10.74C183.358,107.208,178.553,102.4,172.625,102.4z",
  "M361.657,301.511c19.402-30.436,30.645-66.546,30.645-105.244C392.302,88.036,304.318,0,196.151,0c-38.676,0-74.765,11.25-105.182,30.663C66.734,46.123,46.11,66.759,30.659,91.008C11.257,121.444,0,157.568,0,196.267c0,108.217,87.998,196.266,196.151,196.266c38.676,0,74.779-11.264,105.197-30.677C325.582,346.396,346.206,325.76,361.657,301.511z M259.758,320.242c-19.075,9.842-40.708,15.403-63.607,15.403c-76.797,0-139.296-62.535-139.296-139.378c0-22.912,5.558-44.558,15.394-63.644c13.318-25.856,34.483-47.019,60.323-60.331c19.075-9.842,40.694-15.403,63.578-15.403c76.812,0,139.296,62.521,139.296,139.378c0,22.898-5.558,44.53-15.394,63.616C306.749,285.739,285.598,306.916,259.758,320.242z",
  "M499.516,439.154L386.275,326.13c-16.119,23.552-36.771,44.202-60.309,60.345l113.241,113.024c8.329,8.334,19.246,12.501,30.148,12.501c10.916,0,21.833-4.167,30.162-12.501C516.161,482.83,516.161,455.822,499.516,439.154z",
];

export const RELOAD_ICON_PATH_DATA =
  "M446.025,92.206c-40.762-42.394-97.487-69.642-160.383-72.182c-15.791-0.638-29.114,11.648-29.752,27.433c-0.638,15.791,11.648,29.114,27.426,29.76c47.715,1.943,90.45,22.481,121.479,54.681c30.987,32.235,49.956,75.765,49.971,124.011c-0.015,49.481-19.977,94.011-52.383,126.474c-32.462,32.413-76.999,52.368-126.472,52.382c-49.474-0.015-94.025-19.97-126.474-52.382c-32.405-32.463-52.368-76.992-52.382-126.474c0-3.483,0.106-6.938,0.302-10.364l34.091,16.827c3.702,1.824,8.002,1.852,11.35,0.086c3.362-1.788,5.349-5.137,5.264-8.896l-3.362-149.834c-0.114-4.285-2.88-8.357-7.094-10.464c-4.242-2.071-9.166-1.809-12.613,0.738L4.008,182.45c-3.05,2.221-4.498,5.831-3.86,9.577c0.61,3.759,3.249,7.143,6.966,8.974l35.722,17.629c-1.937,12.166-3.018,24.602-3.018,37.279c-0.014,65.102,26.475,124.31,69.153,166.944C151.607,465.525,210.8,492.013,275.91,492c65.095,0.014,124.302-26.475,166.937-69.146c42.678-42.635,69.167-101.842,69.154-166.944C512.014,192.446,486.844,134.565,446.025,92.206z";

export const SETTINGS_ICON_PATH_DATA =
  "M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.37-.31-.6-.22l-2.49 1a7.28 7.28 0 0 0-1.69-.98L14.5 2.42C14.47 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.5.42L9.12 5.07c-.61.24-1.18.56-1.69.98l-2.49-1c-.23-.08-.48 0-.6.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65c-.19.15-.25.42-.12.64l2 3.46c.12.22.37.31.6.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4c.25 0 .47-.18.5-.42l.38-2.65c.61-.25 1.18-.58 1.69-.98l2.49 1c.23.08.48 0 .6-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z";

export const ERROR_ICON_PATHS = [
  "M2.20164 18.4695L10.1643 4.00506C10.9021 2.66498 13.0979 2.66498 13.8357 4.00506L21.7984 18.4695C22.4443 19.6428 21.4598 21 19.9627 21H4.0373C2.54022 21 1.55571 19.6428 2.20164 18.4695Z",
  "M12 9V13",
  "M12 17.0195V17",
];
export const ERROR_ICON_COLOR = "#EA4335";

export const PLACEHOLDER_DEFAULT = "クラス全体を検索…";
export const PLACEHOLDER_SYNC_ERROR = "同期に失敗しました";
export const PLACEHOLDER_LOGIN_REQUIRED = "Googleアカウントにログインしてください。";
export const PLACEHOLDER_RELOAD_REQUIRED = "ページをリロードしてください。";
export const PLACEHOLDER_ACCOUNT_MISMATCH = "アカウントを確認してから再試行してください。";
export const PLACEHOLDER_ACCOUNT_SWITCH_SUCCESS = "Google Classroom をリロードしてください";

export const RELOAD_ERROR_KEYWORDS = ["no response from background"];
export const LOGIN_ERROR_KEYWORDS = [
  "getauthtoken",
  "oauth",
  "no token",
  "not authorized",
  "authorization",
  "http 401",
];

export const JAPAN_TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const API_MODE = true;
export const POLL_INTERVAL_MS = 5 * 60 * 1000;
export const ALLOWED_NAV_HOSTS = new Set(["classroom.google.com"]);

export const AUTH_INIT_STATE_KEY = "gcxAuthInitStateV1";
export const ACCOUNT_SWITCH_STATE_KEY = "gcxAccountSwitchStateV1";
export const STREAM_DB_NAME_BASE = "gcx-stream";
export const STREAM_DB_VERSION = 1;
export const STREAM_STORE_NAME = "posts";

export const IMAGE_EXT_PATTERN = /\.(?:png|jpe?g|gif|bmp|webp|svg|heic|heif|tiff?)$/i;
export const DOC_EXT_PATTERN = /\.(?:docx?|gdoc)$/i;
export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
export const GOOGLE_DOC_URL_PATTERN = /docs\.google\.com\/document/i;

export const STREAM_SELECTOR_PRIMARY = '[data-stream-item-id], [data-item-id][jsmodel*="N2jS6b"]';
export const STREAM_SELECTOR_FALLBACK =
  'c-wiz[jsmodel*="N2jS6b"], article[jsmodel*="N2jS6b"], li[jsmodel*="N2jS6b"]';
export const STREAM_ID_SELECTOR = "[data-stream-item-id], [data-item-id]";
