import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* =========================================================
   11HUNT — WEBSITE EVIDENCE ANALYZER
   ========================================================= */

const MAX_PAGES = 6;
const REQUEST_TIMEOUT = 10000;

/* -----------------------------
   URL HELPERS
----------------------------- */

function normalizeUrl(value) {
  try {
    let url = new URL(value);

    url.hash = "";

    // Remove tracking parameters
    const removeParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
    ];

    for (const param of removeParams) {
      url.searchParams.delete(param);
    }

    // Remove trailing slash except homepage
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    return url.toString();
  } catch {
    return null;
  }
}

function getPageKey(value) {
  try {
    const url = new URL(value);

    let path = url.pathname.toLowerCase();

    if (path.length > 1) {
      path = path.replace(/\/+$/, "");
    }

    return `${url.hostname.toLowerCase()}${path}`;
  } catch {
    return value;
  }
}

/* -----------------------------
   FETCH PUBLIC PAGE
----------------------------- */

async function fetchPage(url) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml",
      },
    });

    const html = await response.text();

    return {
      requestedUrl: url,
      finalUrl: normalizeUrl(response.url) || url,
      status: response.status,
      html,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/* -----------------------------
   PAGE TITLE
----------------------------- */

function getPageTitle(html) {
  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  if (!match) {
    return "Untitled page";
  }

  return match[1]
    .replace(/\s+/g, " ")
    .replace(/&amp;/gi, "&")
    .trim()
    .slice(0, 180);
}

/* -----------------------------
   DISCOVER RELEVANT PAGES
----------------------------- */

function findRelevantLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();

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

      if (
        absolute.protocol !== "http:" &&
        absolute.protocol !== "https:"
      ) {
        continue;
      }

      if (
        absolute.hostname.toLowerCase() !==
        base.hostname.toLowerCase()
      ) {
        continue;
      }

      const pathname =
        absolute.pathname.toLowerCase();

      const combined =
        `${pathname} ${anchorText}`.toLowerCase();

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
        combined.includes("clinic") ||
        combined.includes("location") ||
        combined.includes("team");

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
      // Ignore malformed links.
    }
  }

  return links;
}

/* -----------------------------
   SIGNAL DETECTION
----------------------------- */

function hasAny(html, patterns) {
  return patterns.some((pattern) =>
    pattern.test(html)
  );
}

function detectSignals(html) {
  const lower = html.toLowerCase();

  const booking = hasAny(lower, [
    /book\s+(an\s+)?appointment/,
    /book\s+now/,
    /schedule\s+(an\s+)?appointment/,
    /appointment/,
    /booking/,
    /reserve/,
  ]);

  const whatsapp = hasAny(lower, [
    /wa\.me/,
    /whatsapp/,
    /api\.whatsapp\.com/,
  ]);

 const chatbot = hasAny(lower, [
  /intercom\.com/,
  /widget\.intercom\.io/,
  /js\.intercomcdn\.com/,

  /tawk\.to/,
  /embed\.tawk\.to/,

  /crisp\.chat/,
  /client\.crisp\.chat/,

  /tidio\.co/,
  /code\.tidio\.co/,

  /drift\.com/,
  /js\.driftt\.com/,

  /zendesk\.com/,
  /zdassets\.com/,
  /zopim\.com/,

  /livechatinc\.com/,
  /livechat\.com/,

  /hubspot\.com.*chat/,
  /js\.hs-scripts\.com.*chat/,

  /messenger\.com/,
  /facebook\.com.*messenger/,
]);

  const leadForm = hasAny(lower, [
    /<form\b/,
    /contact-form/,
    /contactform/,
    /wpforms/,
    /gravityforms/,
    /forminator/,
    /elementor-form/,
  ]);

  const phone = hasAny(lower, [
    /tel:/,
    /phone/,
    /mobile/,
    /telephone/,
    /\+91[\s\-()]*\d/,
    /\b0\d{2,4}[\s\-]?\d{5,8}\b/,
  ]);

  const email = hasAny(lower, [
    /mailto:/,
    /email/,
    /e-mail/,
    /@[\w.-]+\.[a-z]{2,}/,
  ]);

  return {
    booking,
    whatsapp,
    chatbot,
    leadForm,
    phone,
    email,

    // Friendly labels for the frontend
    bookingDetected: booking,
    whatsappDetected: whatsapp,
    chatbotDetected: chatbot,
    leadFormDetected: leadForm,
    phoneDetected: phone,
    emailDetected: email,
  };
}

/* -----------------------------
   SCORE
----------------------------- */

function calculateScore(evidence) {
  let score = 50;

  // Existing useful infrastructure
  if (evidence.booking) score += 5;
  if (evidence.whatsapp) score += 5;
  if (evidence.leadForm) score += 5;
  if (evidence.phone) score += 3;
  if (evidence.email) score += 2;

  // Missing automation opportunity
  if (!evidence.chatbot) score += 15;

  return Math.max(0, Math.min(100, score));
}

/* -----------------------------
   OPPORTUNITIES
----------------------------- */

function createOpportunities(
  evidence,
  pageCount
) {
  const opportunities = [];

  if (!evidence.chatbot) {
    opportunities.push({
      id: "ai-website-assistant",
      number: 1,
      category: "AI AUTOMATION",
      title: "AI Website Assistant",
      name: "AI Website Assistant",

      signal:
        "No common chatbot or live-chat integration was detected across the scanned public pages.",

      confidence: "MEDIUM",

      why:
        `The website has ${pageCount} publicly accessible page${
          pageCount === 1 ? "" : "s"
        } that can be reviewed by visitors. An assistant could potentially help answer common questions and route interested visitors toward existing contact or booking options.`,

      potentialService:
        "FAQ + lead qualification chatbot",

      service:
        "FAQ + lead qualification chatbot",

      description:
        "Create a website assistant trained on the business's public services, FAQs and contact information.",

      evidence: {
        chatbot: false,
        pagesScanned: pageCount,
      },
    });
  }

  return opportunities;
}

/* =========================================================
   ANALYZER PLUGIN
   ========================================================= */

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

            /* -------------------------
               FIRST PAGE
            ------------------------- */

            const firstPage =
              await fetchPage(target);

            const pages = [firstPage];

            /* -------------------------
               DISCOVER LINKS
            ------------------------- */

            const discoveredLinks =
              findRelevantLinks(
                firstPage.html,
                firstPage.finalUrl
              );

            const seenKeys = new Set([
              getPageKey(firstPage.finalUrl),
            ]);

            /* -------------------------
               SCAN UP TO 6 PAGES
            ------------------------- */

            for (const link of discoveredLinks) {
              if (pages.length >= MAX_PAGES) {
                break;
              }

              const key = getPageKey(link);

              if (seenKeys.has(key)) {
                continue;
              }

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
              } catch (error) {
                console.log(
                  "Skipped page:",
                  link,
                  error?.message
                );
              }
            }

            /* -------------------------
               COMBINE EVIDENCE
            ------------------------- */

            const combinedHtml = pages
              .map((page) => page.html)
              .join("\n");

            const evidence =
              detectSignals(combinedHtml);

            const score =
              calculateScore(evidence);

            const opportunities =
              createOpportunities(
                evidence,
                pages.length
              );

            /* -------------------------
               PAGE RESULTS
            ------------------------- */

            const pageResults = pages.map(
              (page) => ({
                url: page.finalUrl,
                status: page.status,
                title:
                  getPageTitle(page.html),
              })
            );

            /* -------------------------
               RESPONSE
            ------------------------- */

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

/* =========================================================
   VITE CONFIG
   ========================================================= */

export default defineConfig({
  plugins: [
    react(),
    analyzerPlugin(),
  ],

  server: {
    port: 5173,
    strictPort: false,
  },
});