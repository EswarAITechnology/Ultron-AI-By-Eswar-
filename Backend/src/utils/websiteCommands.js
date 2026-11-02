const websites = [
  {
    name: "YouTube",
    url: "https://www.youtube.com",
    keywords: ["youtube"]
  },
  {
    name: "Google",
    url: "https://www.google.com",
    keywords: ["google"]
  },
  {
    name: "OpenRouter",
    url: "https://openrouter.ai",
    keywords: ["openrouter"]
  },
  {
    name: "Gemini",
    url: "https://gemini.google.com",
    keywords: ["gemini website", "google gemini"]
  },
  {
    name: "GitHub",
    url: "https://github.com",
    keywords: ["github"]
  },
  {
    name: "Fish Audio",
    url: "https://fish.audio",
    keywords: ["fish audio"]
  }
];

export function detectWebsiteCommand(text) {
  const normalized = text.toLowerCase().trim();

  const isOpeningRequest =
    /\b(open|launch|visit|go to)\b/.test(normalized);

  if (!isOpeningRequest) return null;

  const site = websites.find(item =>
    item.keywords.some(keyword =>
      normalized.includes(keyword)
    )
  );

  if (!site) return null;

  return {
    type: "OPEN_WEBSITE",
    name: site.name,
    url: site.url,
    message: `Certainly, Eswar Sir. Opening ${site.name}.`
  };
}
