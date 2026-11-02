declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    PHOTO_STORAGE_PROVIDER?: string;
    BUNNY_STORAGE_ZONE?: string;
    BUNNY_STORAGE_ENDPOINT?: string;
    BUNNY_STORAGE_REGION?: string;
    BUNNY_STORAGE_PASSWORD?: string;
    STAFF_EMAILS?: string;
    DEMO_ACCOUNT_UID?: string;
    DEMO_LOGIN_EMAIL?: string;
    DEMO_LOGIN_PASSWORD?: string;
    FIREBASE_PROJECT_ID?: string;
    FIREBASE_WEB_API_KEY?: string;
    FIREBASE_AUTH_DOMAIN?: string;
    FIREBASE_APP_ID?: string;
    FIREBASE_AUTH_EMULATOR_HOST?: string;
    /** Game backend origin for server-to-server progress reads, e.g. http://127.0.0.1:3000. */
    GAME_API_BASE_URL?: string;
    /** "mock" shows a labelled sample in a development build only. */
    PROGRESS_SOURCE?: string;
  }
}
