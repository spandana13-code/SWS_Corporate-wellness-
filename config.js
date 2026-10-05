// ============================================================
//  SETTINGS — the only file you need to edit.
//  Leave SUPABASE_URL empty to run the site in demo mode.
// ============================================================
export const CONFIG = {
  // From Supabase → Project Settings → API
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // Your WhatsApp number for the "Ask Vanshika" button: country code + number, no + or spaces
  COACH_WHATSAPP: "919036147675",
  COACH_NAME: "Vanshika",

  // Shown on the login screen and in messages
  PROGRAM_NAME: "Corporate Wellness",
  COMPANY: "Goldman Sachs",

  // Your site's address once it's live on Vercel (used in the welcome WhatsApp message)
  SITE_URL: "https://your-site.vercel.app"
};

export const DEMO = !CONFIG.SUPABASE_URL;
