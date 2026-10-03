import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const MAX_PAGES = 6;

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);

    parsed.hash = "";
    parsed.search = "";

    // Remove common tracking parameters
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
    ].forEach((param) => {
      parsed.searchParams.delete(param);
    });

    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function getPageKey(url) {
  try {
    const parsed = new URL(url);

    return (
      parsed.hostname.toLowerCase() +
      parsed.pathname.toLowerCase().replace(/\/+$/, "")
    );
  } catch {
    return url.toLowerCase();
  }
}

function detectSignals(html) {
  const lower = html.toLowerCase();

  return {
    booking:
      lower.includes("book appointment") ||
      lower.includes("book an appointment") ||
      lower.includes("schedule appointment") ||
      lower.includes("schedule an appointment") ||
      lower.includes("appointment booking") ||
      lower.includes("make an appointment"),

    whatsapp:
      lower.includes("whatsapp") ||
      lower.includes("wa.me") ||
      lower.includes("api.whatsapp.com"),

    chatbot:
      lower.includes("tawk.to") ||
      lower.includes("tidio") ||
      lower.includes("intercom") ||
      lower.includes("crisp.chat") ||
      lower.includes("drift.com") ||
      lower.includes("livechat") ||
      lower.includes("zendesk") ||
      lower.includes("chatbot") ||
      lower.includes("botpress"),

    leadForm:
      /<form[\s>]/i.test(html) ||
      lower.includes("contact form") ||
      lower.includes("leave us a message"),

    phone:
      /(\+91[\s-]?)?[6-9]\d{9}/.test(html),

    email:
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(html),
  };
}

function findRelevantLinks(html, baseUrl) {
  const links = [];

  const regex =
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1];

    function findRelevantLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();

  // Find all anchor tags and extract href + visible text
  const anchorRegex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = match[1];

    const anchorText = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    try {
      const absolute = new URL(href, baseUrl);
      const base = new URL(baseUrl);

      // Only HTTP/HTTPS
      if (
        absolute.protocol !== "http:" &&
        absolute.protocol !== "https:"
      ) {
        continue;
      }

      // Stay on the same domain
      if (
        absolute.hostname.toLowerCase() !==
        base.hostname.toLowerCase()
      ) {
        continue;
      }

      const pathname = absolute.pathname.toLowerCase();

      const combined =
        `${pathname} ${anchorText}`.toLowerCase();

      // Pages that can contain useful business evidence
      const relevant =
        combined.includes("contact") ||
        combined.includes("appointment") ||
        combined.includes("book") ||
        combined.includes("booking") ||
        combined.includes("service") ||
        combined.includes("services") ||
        combined.includes("treatment") ||
        combined.includes("about") ||
        combined.includes("faq") ||
        combined.includes("price") ||
        combined.includes("pricing") ||
        combined.includes("doctor") ||
        combined.includes("dentist") ||
        combined.includes("clinic");

      if (!relevant) {
        continue;
      }

      const normalized = normalizeUrl(
        absolute.toString()
      );

      if (!normalized) {
        continue;
      }

      const key = getPageKey(normalized);

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      links.push(normalized);
    } catch {
      // Ignore invalid links.
    }
  }

  return links;
}

  const unique = [];
  const seen = new Set();

  for (const link of links) {
    const key = getPageKey(link);

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(link);
    }
  }

  return unique;
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; 11Hunt/1.0)",
      Accept:
        "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  return {
    requestedUrl: url,
    finalUrl: response.url,
    status: response.status,
    html,
  };
}

function getPageTitle(html) {
  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  if (!match) {
    return "Untitled page";
  }

  return match[1]
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function createOpportunities(evidence, pageCount) {
  const opportunities = [];

  if (!evidence.chatbot) {
    opportunities.push({
      title: "AI Website Assistant",

      category: "AI AUTOMATION",

      service:
        "FAQ + lead qualification chatbot",

      reason:
        "No common chatbot or live-chat integration was detected across the scanned public pages.",

      why:
        `The website has ${pageCount} publicly accessible page${
          pageCount === 1 ? "" : "s"
        } that can be reviewed by visitors. An assistant could potentially help answer common questions and route interested visitors toward existing contact or booking options.`,

      build:
        "Create a website assistant trained on the business's public services, FAQs and contact information.",

      confidence: "MEDIUM",
    });
  }

  if (!evidence.booking) {
    opportunities.push({
      title: "Appointment Automation",

      category: "AUTOMATION",

      service:
        "Appointment booking + reminder workflow",

      reason:
        "No common appointment-booking signal was detected across the scanned pages.",

      why:
        "Visitors may currently need to use another contact method to arrange an appointment.",

      build:
        "Create an appointment flow connected to the business's preferred scheduling process.",

      confidence: "LOW",
    });
  }

  if (!evidence.whatsapp) {
    opportunities.push({
      title: "WhatsApp Lead Capture",

      category: "LEAD GENERATION",

      service:
        "WhatsApp inquiry + follow-up automation",

      reason:
        "No WhatsApp signal was detected across the scanned public pages.",

      why:
        "A WhatsApp-based inquiry flow could provide another contact path if the business wants to support it.",

      build:
        "Create a WhatsApp entry point with structured questions and lead capture.",

      confidence: "LOW",
    });
  }

  if (!evidence.leadForm) {
    opportunities.push({
      title: "Website Lead Capture",

      category: "LEAD GENERATION",

      service:
        "Lead form + notification automation",

      reason:
        "No common contact-form signal was detected.",

      why:
        "A structured lead form could make website inquiries easier to capture.",

      build:
        "Create a simple form that sends new inquiries to the business's chosen destination.",

      confidence: "LOW",
    });
  }

  return opportunities;
}

function calculateScore(evidence) {
  let score = 50;

  if (!evidence.chatbot) score += 15;
  if (!evidence.booking) score += 12;
  if (!evidence.whatsapp) score += 8;
  if (!evidence.leadForm) score += 10;

  return Math.min(score, 95);
}

function analyzerPlugin() {
  return {
    name: "11hunt-analyzer",

    configureServer(server) {
      server.middlewares.use(
        "/api/analyze",
        async (req, res) => {
          try {
            const requestUrl = new URL(
              req.url,
              "http://localhost"
            );

            let target =
              requestUrl.searchParams.get("url");

            if (!target) {
              throw new Error(
                "Website URL is required."
              );
            }

            if (
              !target.startsWith("http://") &&
              !target.startsWith("https://")
            ) {
              target = `https://${target}`;
            }

            target = normalizeUrl(target);

            if (!target) {
              throw new Error(
                "Invalid website URL."
              );
            }

            const firstPage =
              await fetchPage(target);

            const pages = [firstPage];

            const discoveredLinks =
              findRelevantLinks(
                firstPage.html,
                firstPage.finalUrl
              );

            const seenKeys = new Set([
              getPageKey(firstPage.finalUrl),
            ]);

            for (
              const link of discoveredLinks
            ) {
              if (pages.length >= MAX_PAGES) {
                break;
              }

              const key = getPageKey(link);

              if (seenKeys.has(key)) {
                continue;
              }

              seenKeys.add(key);

              try {
                const page =
                  await fetchPage(link);

                const finalKey =
                  getPageKey(page.finalUrl);

                if (seenKeys.has(finalKey)) {
                  continue;
                }

                seenKeys.add(finalKey);
                pages.push(page);
              } catch {
                // Continue scanning.
              }
            }

            const combinedHtml = pages
              .map((page) => page.html)
              .join("\n");

            const evidence =
              detectSignals(combinedHtml);

            const opportunities =
              createOpportunities(
                evidence,
                pages.length
              );

            const score =
              calculateScore(evidence);

            const pageResults = pages.map(
              (page) => ({
                url: page.finalUrl,
                status: page.status,
                title:
                  getPageTitle(page.html),
              })
            );

            const result = {
              success: true,

              website: {
                requested: target,
                finalUrl:
                  firstPage.finalUrl,
                analyzedPages:
                  pages.length,
              },

              pages: pageResults,

              evidence,

              score,

              opportunities,

              disclaimer:
                "Signals are based on public HTML from the analyzed pages. A missing signal does not prove that a feature is absent elsewhere on the website.",
            };

            res.statusCode = 200;

            res.setHeader(
              "Content-Type",
              "application/json"
            );

            res.end(
              JSON.stringify(result)
            );
          } catch (error) {
            console.error(
              "11Hunt analyzer error:",
              error
            );

            res.statusCode = 500;

            res.setHeader(
              "Content-Type",
              "application/json"
            );

            res.end(
              JSON.stringify({
                success: false,
                error:
                  error?.message ||
                  "Website analysis failed.",
              })
            );
          }
        }
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    analyzerPlugin(),
  ],
});