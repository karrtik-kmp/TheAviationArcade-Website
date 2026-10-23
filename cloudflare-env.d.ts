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
  }
}
