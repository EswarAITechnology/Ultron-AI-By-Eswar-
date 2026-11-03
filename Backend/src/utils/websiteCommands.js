/**
 * Intelligent Website and Search Command Engine for Ultron AI
 * Engineered for Eswar Sir
 */

const KNOWN_PLATFORMS = [
  {
    name: "YouTube",
    domain: "youtube.com",
    homeUrl: "https://www.youtube.com",
    searchUrl: query => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    keywords: ["youtube", "yt"]
  },
  {
    name: "Google",
    domain: "google.com",
    homeUrl: "https://www.google.com",
    searchUrl: query => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    keywords: ["google"]
  },
  {
    name: "Instagram",
    domain: "instagram.com",
    homeUrl: "https://www.instagram.com",
    searchUrl: query => `https://www.instagram.com/${encodeURIComponent(query.replace(/^@/, ""))}/`,
    keywords: ["instagram", "insta"]
  },
  {
    name: "GitHub",
    domain: "github.com",
    homeUrl: "https://github.com",
    searchUrl: query => `https://github.com/search?q=${encodeURIComponent(query)}`,
    keywords: ["github"]
  },
  {
    name: "Twitter / X",
    domain: "x.com",
    homeUrl: "https://x.com",
    searchUrl: query => `https://x.com/search?q=${encodeURIComponent(query)}`,
    keywords: ["twitter", "x.com", "tweets"]
  },
  {
    name: "Spotify",
    domain: "spotify.com",
    homeUrl: "https://open.spotify.com",
    searchUrl: query => `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    keywords: ["spotify"]
  },
  {
    name: "Reddit",
    domain: "reddit.com",
    homeUrl: "https://www.reddit.com",
    searchUrl: query => `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
    keywords: ["reddit"]
  },
  {
    name: "Netflix",
    domain: "netflix.com",
    homeUrl: "https://www.netflix.com",
    searchUrl: query => `https://www.netflix.com/search?q=${encodeURIComponent(query)}`,
    keywords: ["netflix"]
  },
  {
    name: "WhatsApp",
    domain: "web.whatsapp.com",
    homeUrl: "https://web.whatsapp.com",
    keywords: ["whatsapp", "wa"]
  },
  {
    name: "Gmail",
    domain: "mail.google.com",
    homeUrl: "https://mail.google.com",
    keywords: ["gmail", "email"]
  },
  {
    name: "ChatGPT",
    domain: "chatgpt.com",
    homeUrl: "https://chatgpt.com",
    keywords: ["chatgpt"]
  },
  {
    name: "Fish Audio",
    domain: "fish.audio",
    homeUrl: "https://fish.audio",
    keywords: ["fish audio"]
  },
  {
    name: "Claude",
    domain: "claude.ai",
    homeUrl: "https://claude.ai",
    keywords: ["claude"]
  },
  {
    name: "Wikipedia",
    domain: "wikipedia.org",
    homeUrl: "https://www.wikipedia.org",
    searchUrl: query => `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
    keywords: ["wikipedia", "wiki"]
  }
];

export function detectWebsiteCommand(rawText) {
  if (typeof rawText !== "string") return null;

  const text = rawText.trim();
  const lower = text.toLowerCase();

  // If it's a conversational question, let the AI answer instead of opening websites
  // e.g. "what's your name? and who created you?", "who is...", "why does..."
  const isQuestion =
    /^(who|what|why|how|when|where|which|is|are|can you|could you|tell me|explain)\b/i.test(lower) ||
    lower.endsWith("?");
  
  // Only override question if it explicitly asks to "open" or "search" something
  const hasActionVerb = /^(open|launch|visit|go to|take me to|search|play|watch|google)\b/i.test(lower);
  if (isQuestion && !hasActionVerb) {
    return null;
  }

  // 1. YOUTUBE CHANNEL & SEARCH PATTERNS (e.g. "open hi5 gamer channel", "open hi5 gamer youtube channel", "open youtube and open hi5 gamer channel")
  // Matches: "open youtube and open <channel>", "open youtube and search <query>", "open <channel> youtube channel", etc.
  const ytChannelPatterns = [
    // "open youtube and (open|search|play) <query>"
    /^open\s+youtube\s+and\s+(?:open|search|play|go to|watch)?\s*(.+)$/i,
    // "open <channel> (youtube channel|yt channel|channel)"
    /^open\s+(.+?)\s+(?:youtube\s+channel|yt\s+channel|channel)$/i,
    // "open (youtube channel|yt channel|channel) (?:of\s+)?(.+)"
    /^open\s+(?:youtube\s+channel|yt\s+channel|channel)\s+(?:of\s+)?(.+)$/i,
    // "play/watch/search <query> on youtube"
    /^(?:play|watch|search)\s+(.+?)\s+on\s+(?:youtube|yt)$/i,
    // "open youtube <query>" (e.g. "open youtube mrbeast", "open youtube lofi")
    /^open\s+(?:youtube|yt)\s+(?:for\s+)?(.+)$/i,
    // "<channel> (youtube channel|yt channel)"
    /^(.+?)\s+(?:youtube\s+channel|yt\s+channel)$/i
  ];

  for (const pattern of ytChannelPatterns) {
    const match = lower.match(pattern);
    if (match && match[1]) {
      let query = match[1].trim();
      // clean trailing/leading filler words
      query = query
        .replace(/^(channel|youtube|yt|for|video|of)\s+/i, "")
        .replace(/\s+(channel|youtube|yt|videos?)$/i, "")
        .trim();

      if (query && query !== "youtube" && query !== "yt") {
        return {
          type: "OPEN_WEBSITE",
          name: `${query} (YouTube)`,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
          message: `Opening ${query} on YouTube, Eswar Sir. What should I do now?`
        };
      }
    }
  }

  // 2. YOUTUBE EXACT HOMEPAGE
  if (/^(open|launch|visit|go to)\s+(?:youtube|yt)$/i.test(lower) || lower === "youtube") {
    return {
      type: "OPEN_WEBSITE",
      name: "YouTube",
      url: "https://www.youtube.com",
      message: "Opening YouTube, Eswar Sir. What should I do now?"
    };
  }

  // 3. INSTAGRAM PROFILES & HOMEPAGE (e.g. "open instagram", "open instagram messi", "open messi on instagram")
  const instaProfileMatch =
    lower.match(/^open\s+instagram\s+(?:profile\s+)?(?:of\s+)?([a-z0-9_.]+)$/i) ||
    lower.match(/^open\s+([a-z0-9_.]+)\s+on\s+instagram$/i);
  if (instaProfileMatch && instaProfileMatch[1] && instaProfileMatch[1] !== "instagram") {
    const profile = instaProfileMatch[1].trim().replace(/^@/, "");
    return {
      type: "OPEN_WEBSITE",
      name: `@${profile} (Instagram)`,
      url: `https://www.instagram.com/${encodeURIComponent(profile)}/`,
      message: `Opening @${profile} on Instagram, Eswar Sir. What should I do now?`
    };
  }

  if (/^(open|launch|visit|go to)\s+(?:instagram|insta)$/i.test(lower) || lower === "instagram") {
    return {
      type: "OPEN_WEBSITE",
      name: "Instagram",
      url: "https://www.instagram.com",
      message: "Opening Instagram, Eswar Sir. What should I do now?"
    };
  }

  // 4. SPOTIFY SONGS & PLAYLISTS (e.g. "play <song> on spotify", "open spotify <query>")
  const spotifyMatch =
    lower.match(/^(?:play|search)\s+(.+?)\s+on\s+spotify$/i) ||
    lower.match(/^open\s+spotify\s+(?:for\s+)?(.+)$/i);
  if (spotifyMatch && spotifyMatch[1] && spotifyMatch[1] !== "spotify") {
    const query = spotifyMatch[1].trim();
    return {
      type: "OPEN_WEBSITE",
      name: `${query} (Spotify)`,
      url: `https://open.spotify.com/search/${encodeURIComponent(query)}`,
      message: `Searching for '${query}' on Spotify, Eswar Sir. What should I do now?`
    };
  }

  // 5. GOOGLE SEARCH EXPLICIT (e.g. "search <query> on google", "google <query>", "search for <query>")
  const googleSearchMatch =
    lower.match(/^(?:search|google)\s+(.+?)\s+on\s+google$/i) ||
    lower.match(/^open\s+google\s+and\s+(?:search\s+)?(.+)$/i) ||
    lower.match(/^google\s+(.+)$/i) ||
    lower.match(/^search\s+(?:for\s+)?(.+)$/i);
  if (googleSearchMatch && googleSearchMatch[1]) {
    const query = googleSearchMatch[1].trim();
    if (query && query !== "google") {
      return {
        type: "OPEN_WEBSITE",
        name: query,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        message: `Searching Google for '${query}', Eswar Sir. What should I do now?`
      };
    }
  }

  // 6. KNOWN PLATFORMS BY KEYWORD
  for (const platform of KNOWN_PLATFORMS) {
    for (const kw of platform.keywords) {
      const regex = new RegExp(`^(open|launch|visit|go to)\\s+${kw}$`, "i");
      if (regex.test(lower) || lower === kw) {
        return {
          type: "OPEN_WEBSITE",
          name: platform.name,
          url: platform.homeUrl,
          message: `Opening ${platform.name}, Eswar Sir. What should I do now?`
        };
      }
    }
  }

  // 7. SPECIFIC URL OR DOMAIN (e.g. "open brave.com", "open cricbuzz.com", "open wikipedia.org")
  const domainMatch = lower.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|in|dev|ai|app|co|xyz|edu|gov))\b/i);
  if (domainMatch && hasActionVerb) {
    const domain = domainMatch[1];
    return {
      type: "OPEN_WEBSITE",
      name: domain,
      url: `https://${domain}`,
      message: `Opening ${domain}, Eswar Sir. What should I do now?`
    };
  }

  // 8. FALLBACK GENERAL "OPEN <NAME>"
  const genericOpenMatch = lower.match(/^(?:open|launch|visit|go to)\s+(.+)$/i);
  if (genericOpenMatch && genericOpenMatch[1]) {
    const target = genericOpenMatch[1].trim();
    // Ignore questions or commands that look like conversational prompts
    if (target.length > 1 && !target.includes("chat") && !target.includes("conversation") && !target.includes("mode")) {
      // Check if it's a known single-word service like "facebook", "amazon", "flipkart", "twitch"
      const cleanTarget = target.replace(/[^a-z0-9]/g, "");
      const popularSites = {
        facebook: "https://www.facebook.com",
        amazon: "https://www.amazon.in",
        flipkart: "https://www.flipkart.com",
        twitch: "https://www.twitch.tv",
        cricbuzz: "https://www.cricbuzz.com",
        linkedin: "https://www.linkedin.com",
        pinterest: "https://www.pinterest.com",
        brave: "https://search.brave.com"
      };

      if (popularSites[cleanTarget]) {
        return {
          type: "OPEN_WEBSITE",
          name: target,
          url: popularSites[cleanTarget],
          message: `Opening ${target}, Eswar Sir. What should I do now?`
        };
      }

      // Default to Google Search for the requested target
      return {
        type: "OPEN_WEBSITE",
        name: target,
        url: `https://www.google.com/search?q=${encodeURIComponent(target)}`,
        message: `Opening ${target} in a new tab, Eswar Sir. What should I do now?`
      };
    }
  }

  return null;
}
