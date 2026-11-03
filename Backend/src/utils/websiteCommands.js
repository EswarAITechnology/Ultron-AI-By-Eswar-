const websites = [
  { name: "YouTube", url: "https://www.youtube.com", keywords: ["youtube", "yt"] },
  { name: "Google", url: "https://www.google.com", keywords: ["google"] },
  { name: "GitHub", url: "https://github.com", keywords: ["github"] },
  { name: "OpenRouter", url: "https://openrouter.ai", keywords: ["openrouter"] },
  { name: "Gemini", url: "https://gemini.google.com", keywords: ["gemini"] },
  { name: "ChatGPT", url: "https://chatgpt.com", keywords: ["chatgpt", "openai"] },
  { name: "Twitter / X", url: "https://x.com", keywords: ["twitter", "x.com"] },
  { name: "Instagram", url: "https://www.instagram.com", keywords: ["instagram", "insta"] },
  { name: "Reddit", url: "https://www.reddit.com", keywords: ["reddit"] },
  { name: "Spotify", url: "https://open.spotify.com", keywords: ["spotify"] },
  { name: "Netflix", url: "https://www.netflix.com", keywords: ["netflix"] },
  { name: "Fish Audio", url: "https://fish.audio", keywords: ["fish audio"] }
];

export function detectWebsiteCommand(text) {
  const normalized = text.toLowerCase().trim();

  const isOpeningRequest = /\b(open|launch|visit|go to|take me to)\b/.test(normalized);
  if (!isOpeningRequest) return null;

  // Check known sites
  const matched = websites.find(site =>
    site.keywords.some(k => normalized.includes(k))
  );

  if (matched) {
    return {
      type: "OPEN_WEBSITE",
      name: matched.name,
      url: matched.url,
      message: `Opening ${matched.name}, Eswar Sir. What should I do now?`
    };
  }

  // Check if user requested a specific URL or domain (e.g. "open brave.com" or "open xyz.org")
  const domainMatch = normalized.match(/\b([a-z0-9-]+\.(com|org|net|io|in|dev|ai|app|co))\b/);
  if (domainMatch) {
    const domain = domainMatch[1];
    return {
      type: "OPEN_WEBSITE",
      name: domain,
      url: `https://${domain}`,
      message: `Opening ${domain}, Eswar Sir. What should I do now?`
    };
  }

  // Fallback: search on Google
  const queryMatch = normalized.replace(/^(open|launch|visit|go to)\s+/i, "").trim();
  if (queryMatch) {
    return {
      type: "OPEN_WEBSITE",
      name: queryMatch,
      url: `https://www.google.com/search?q=${encodeURIComponent(queryMatch)}`,
      message: `Opening ${queryMatch} in a new tab, Eswar Sir. What should I do now?`
    };
  }

  return null;
}
