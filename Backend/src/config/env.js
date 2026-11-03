export function validateEnvironment() {
  const required = [
    "GEMINI_API_KEY",
    "OPENROUTER_API_KEY",
    "FISH_API_KEY"
  ];

  const missing = required.filter(
    key => !process.env[key]
  );

  if (missing.length) {
    console.warn(
      "Notice - Missing optional or required API configuration:",
      missing.join(", ")
    );
  }

  // Upgrade deprecated model automatically
  if (!process.env.GEMINI_MODEL || process.env.GEMINI_MODEL.includes("2.5")) {
    process.env.GEMINI_MODEL = "gemini-3.8-flash";
  }

  if (!process.env.OPENROUTER_MODEL) {
    process.env.OPENROUTER_MODEL = "openai/gpt-4o-mini";
  }
}
