/**
 * Universal Intelligent Action & Website Engine for Ultron AI
 * Engineered for Eswar Sir
 * Supports ANY YouTube channel, song, video, search engine, domain, or phone call action.
 */

const KNOWN_PLATFORMS = [
  {
    name: "YouTube",
    domain: "youtube.com",
    homeUrl: "https://www.youtube.com",
    keywords: ["youtube", "yt"]
  },
  {
    name: "Google",
    domain: "google.com",
    homeUrl: "https://www.google.com",
    keywords: ["google"]
  },
  {
    name: "Instagram",
    domain: "instagram.com",
    homeUrl: "https://www.instagram.com",
    keywords: ["instagram", "insta"]
  },
  {
    name: "GitHub",
    domain: "github.com",
    homeUrl: "https://github.com",
    keywords: ["github"]
  },
  {
    name: "Twitter / X",
    domain: "x.com",
    homeUrl: "https://x.com",
    keywords: ["twitter", "x.com", "tweets"]
  },
  {
    name: "Spotify",
    domain: "spotify.com",
    homeUrl: "https://open.spotify.com",
    keywords: ["spotify"]
  },
  {
    name: "Reddit",
    domain: "reddit.com",
    homeUrl: "https://www.reddit.com",
    keywords: ["reddit"]
  },
  {
    name: "Netflix",
    domain: "netflix.com",
    homeUrl: "https://www.netflix.com",
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
    keywords: ["wikipedia", "wiki"]
  },
  {
    name: "Amazon",
    domain: "amazon.in",
    homeUrl: "https://www.amazon.in",
    keywords: ["amazon"]
  },
  {
    name: "Flipkart",
    domain: "flipkart.com",
    homeUrl: "https://www.flipkart.com",
    keywords: ["flipkart"]
  },
  {
    name: "Twitch",
    domain: "twitch.tv",
    homeUrl: "https://www.twitch.tv",
    keywords: ["twitch"]
  },
  {
    name: "Discord",
    domain: "discord.com",
    homeUrl: "https://discord.com",
    keywords: ["discord"]
  },
  {
    name: "Canva",
    domain: "canva.com",
    homeUrl: "https://www.canva.com",
    keywords: ["canva"]
  }
];

export function detectWebsiteCommand(rawText) {
  if (typeof rawText !== "string") return null;

  const text = rawText.trim();
  const lower = text.toLowerCase();

  // If it's a conversational question, let AI handle it unless explicitly asking to open/search
  const isQuestion =
    /^(who|what|why|how|when|where|which|is|are|can you|could you|tell me|explain)\b/i.test(lower) ||
    lower.endsWith("?");

  const hasActionVerb = /^(open|launch|visit|go to|take me to|search|play|watch|google|find)\b/i.test(lower);
  if (isQuestion && !hasActionVerb) {
    return null;
  }

  // 2. UNIVERSAL YOUTUBE CHANNELS & VIDEOS
  // Matches ANY channel name: "open <any name> channel", "open <any name> youtube channel", "open channel <any name>"
  const ytChannelMatch =
    lower.match(/^open\s+(?:youtube\s+and\s+(?:open|search|play|go to|watch)?\s*)?(.+?)\s+(?:youtube\s+channel|yt\s+channel|channel)$/i) ||
    lower.match(/^open\s+(?:youtube\s+channel|yt\s+channel|channel)\s+(?:of\s+)?(.+)$/i) ||
    lower.match(/^(?:play|watch)\s+(?:video\s+(?:of\s+)?)?(.+?)\s+on\s+(?:youtube|yt)$/i) ||
    lower.match(/^(?:play|watch)\s+(?:song\s+)?(.+)$/i) ||
    lower.match(/^open\s+(.+?)\s+on\s+(?:youtube|yt)$/i) ||
    lower.match(/^search\s+(.+?)\s+on\s+(?:youtube|yt)$/i) ||
    lower.match(/^open\s+(?:youtube|yt)\s+(?:for\s+)?(.+)$/i) ||
    lower.match(/^(.+?)\s+(?:youtube\s+channel|yt\s+channel)$/i);

  if (ytChannelMatch && ytChannelMatch[1]) {
    let query = ytChannelMatch[1].trim();
    query = query
      .replace(/^(channel|youtube|yt|for|video|of|and|song|watch)\s+/i, "")
      .replace(/\s+(channel|youtube|yt|videos?|songs?)$/i, "")
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

  // 3. YOUTUBE HOMEPAGE
  if (/^(open|launch|visit|go to)\s+(?:youtube|yt)$/i.test(lower) || lower === "youtube") {
    return {
      type: "OPEN_WEBSITE",
      name: "YouTube",
      url: "https://www.youtube.com",
      message: "Opening YouTube, Eswar Sir. What should I do now?"
    };
  }

  // 4. INSTAGRAM PROFILES & APP (e.g. "open instagram", "open instagram <profile>", "open <user> on instagram")
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

  // 5. SPOTIFY MUSIC
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

  // 6. GOOGLE SEARCH (e.g. "search <anything> on google", "google <anything>", "search for <anything>")
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

  // 7. GITHUB SEARCH / REPO
  const githubMatch =
    lower.match(/^open\s+github\s+(?:for\s+)?(.+)$/i) ||
    lower.match(/^search\s+(.+?)\s+on\s+github$/i);
  if (githubMatch && githubMatch[1] && githubMatch[1] !== "github") {
    const query = githubMatch[1].trim();
    return {
      type: "OPEN_WEBSITE",
      name: `${query} (GitHub)`,
      url: `https://github.com/search?q=${encodeURIComponent(query)}`,
      message: `Searching GitHub for '${query}', Eswar Sir. What should I do now?`
    };
  }

  // 8. KNOWN PLATFORMS BY KEYWORD
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

  // 9. SPECIFIC URL OR DOMAIN (e.g. "open brave.com", "open cricbuzz.com", "open wikipedia.org")
  const domainMatch = lower.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|in|dev|ai|app|co|xyz|edu|gov|tv|ru))\b/i);
  if (domainMatch && hasActionVerb) {
    const domain = domainMatch[1];
    return {
      type: "OPEN_WEBSITE",
      name: domain,
      url: `https://${domain}`,
      message: `Opening ${domain}, Eswar Sir. What should I do now?`
    };
  }

  // 10. GENERAL FALLBACK OPEN <QUERY>
  const genericOpenMatch = lower.match(/^(?:open|launch|visit|go to)\s+(.+)$/i);
  if (genericOpenMatch && genericOpenMatch[1]) {
    const target = genericOpenMatch[1].trim();
    if (target.length > 1 && !target.includes("chat") && !target.includes("mode")) {
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
