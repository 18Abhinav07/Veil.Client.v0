const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#fafaf9" />
  <path d="M18 24h28a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6h24v8H18a2 2 0 0 0-2 2v2Z" fill="#1c1917" />
  <circle cx="45" cy="38" r="4" fill="#fafaf9" />
</svg>`;

export function GET() {
  return new Response(faviconSvg, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml",
    },
  });
}
