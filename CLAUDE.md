# CLAUDE.md

## Project overview

This repository contains **奈良よりみち (Nara Yorimichi)**, a mobile-first web prototype that proposes three short travel routes in Nara based on a user's fixed schedule, free time, budget, desired area, and interests.

The defining product constraint is that every proposal must include travel time and return the user to the requested goal before the next appointment. SHIKA no ASHIATO-listed businesses and facilities should be prioritized.

- Production prototype: https://nara-yorimichi.abcdefghijklmno1226.chatgpt.site
- GitHub: https://github.com/kotonara-tech/kototech-aug-hackathon-team1
- Default branch: `main`
- Runtime: vinext / React 19 / TypeScript / Cloudflare Workers-compatible output
- Node.js: `>=22.13.0`

## Product flow

The first screen offers two entry modes:

1. `予定がある旅行`
   - Travel date
   - Existing schedule in free-form text
   - Free-time start and end
   - Budget per person
   - Start point and required return point
   - Notes such as desired shops, food, or area
2. `いまの空き時間`
   - Available duration
   - Budget per person
   - Current/start point and required return point
   - Notes

The result should provide three meaningfully different routes. Each route must show:

- Total expected cost
- Total duration and travel time
- Ordered stops
- Return time and goal
- Spot type, approximate price, address, coordinates, photo, and expected stay
- Google Maps and Street View links
- A visible warning if the route exceeds the user's budget

## Current implementation

The project is a functional front-end prototype. It currently includes:

- Both input modes and working form state
- Three selectable sample routes
- A visual route map and round-trip timeline
- Spot detail modal with price, address, coordinates, photo, map, and Street View links
- Searchable official catalog drawer
- Responsive desktop/mobile layout
- Open Graph social card in `public/og.png`

The route calculations and the enriched details for the sample stops are currently hardcoded prototype estimates in `app/page.tsx`. Do not present them as live or authoritative data. The UI already labels estimates as prototype values.

## Important files

- `app/page.tsx`
  - Main client UI, form state, sample enriched spots, route definitions, search/filter behavior, modals
- `app/globals.css`
  - Entire visual system and responsive styles
- `app/data/ashiato-spots.json`
  - Structured SHIKA no ASHIATO catalog extracted from the official PDF
- `app/layout.tsx`
  - Japanese page metadata and request-host-based Open Graph URLs
- `public/og.png`
  - Social preview image
- `.openai/hosting.json`
  - OpenAI Sites project binding; preserve `project_id`

## SHIKA no ASHIATO dataset

Official source:

- Landing page: https://www.city.nara.lg.jp/site/shikanoashiato/201908.html
- PDF: https://www.city.nara.lg.jp/uploaded/attachment/204172.pdf

`app/data/ashiato-spots.json` contains **375 unique facilities** extracted from PDF pages 1-11. Pages 12-16 are the `ふるさと納税` subset and were not treated as an additional master list.

The main extracted fields are:

```ts
type CatalogItem = {
  name: string;
  sections: string[];
  genres: string[];
  narafuru: boolean;
  sourcePages: number[];
};
```

Section counts overlap because one facility may be listed in multiple categories:

- グルメ・カフェ: 188
- お土産・ショッピング: 127
- 文化体験・体験: 67
- 宿泊: 34
- サービス: 20

Never discard the full catalog when changing the route UI. Preserve the source URL, original names, genre values, `narafuru`, and page provenance.

The PDF does **not** provide complete addresses, coordinates, live prices, opening hours, or photos. Those fields must be enriched from a licensed/authorized external source and should retain per-field provenance and a verification timestamp.

Recommended future normalized record:

```ts
type Place = {
  id: string;
  name: string;
  shikaMember: boolean;
  shikaStoreId?: string;
  genres: string[];
  address?: string;
  latitude?: number;
  longitude?: number;
  priceMin?: number;
  priceMax?: number;
  admissionFee?: number;
  expectedStayMinutes?: number;
  openingHours?: unknown;
  photoUrl?: string;
  sources: Record<string, string>;
  verifiedAt?: string;
};
```

## SHIKA no ASHIATO integration boundary

Do not assume that any arbitrary QR code can award points or coupons. SHIKA no ASHIATO QR codes are likely server-side campaign/store identifiers managed by Nara City and SYMONS.

The intended later flow is:

1. This app proposes three routes.
2. The user selects one route.
3. Completion is verified by GPS, a store QR, purchase approval, or a combination.
4. A pre-registered SHIKA no ASHIATO campaign awards the coupon/points.

Any real coupon issuance, one-time code import, campaign creation, deep link, or completion callback requires confirmation and authorization from Nara City/SYMONS. Do not reverse-engineer or call a private mobile API.

## Next technical milestone

Replace prototype estimates with live place and route data. The likely Google Maps Platform services are:

- Places API (New): place matching, address, categories, hours, price level, photos
- Routes API: walking/transit travel time and round-trip feasibility
- Street View Static API or Maps URL: visual context

Suggested environment variables:

```bash
GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=
```

Prefer server-side calls for Places and Routes. Restrict server keys by API and deployment environment. Restrict browser keys by allowed referrer. Never commit API keys or secrets.

The route solver should enforce hard constraints before ranking:

- `arrivalAtGoal <= requiredEndTime - safetyBuffer`
- `totalExpectedCost <= budget`
- Venue is expected to be open during arrival/stay
- Travel mode is supported
- Required reservation lead time is satisfied

Then rank feasible routes by user preference match, SHIKA no ASHIATO membership, travel efficiency, route diversity, and confidence in the underlying data.

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

Run `npm run build` before committing. The development server may choose port 3001 if port 3000 is occupied.

## Coding guidelines

- Keep the interface and user-facing copy in Japanese.
- Preserve the current warm ivory, moss green, and vermilion visual direction unless intentionally redesigning the product.
- Keep touch targets and the mobile layout usable; the primary audience may be walking while using a phone.
- Maintain keyboard focus styles, labels, and dialog semantics.
- Avoid loading all 375 records into the visible DOM at once; retain incremental display or pagination.
- Keep route and place types explicit. Move large hardcoded datasets out of `app/page.tsx` as the implementation grows.
- Clearly distinguish official source data, enriched third-party data, estimated values, and live values.
- Never claim that prices, opening hours, travel times, or availability are current unless they came from a live source.
- Do not remove the mandatory return-to-goal constraint.
- Do not commit `.env*`, credentials, generated build output, or local PDF scratch files.

## Git workflow

The repository is already configured as:

```bash
origin https://github.com/kotonara-tech/kototech-aug-hackathon-team1.git
```

Use focused commits on `main` unless the team asks for a feature branch. Do not rewrite published history. Before pushing, check for unrelated user changes and preserve them.

## Definition of done for the next iteration

- User can enter either travel mode without confusing or duplicated fields.
- Three route results are actually derived from the user's time, budget, start, goal, and notes.
- Every proposed route returns to the requested goal on time with a safety buffer.
- Proposed stops exist in the structured SHIKA no ASHIATO catalog or are explicitly marked as supplemental.
- Spot details show source and freshness information.
- Loading, empty, no-feasible-route, API-error, and mobile states are handled.
- `npm run build` succeeds.
