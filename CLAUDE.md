# PickleDeals — working rules

- The approved design in `preview/` is the visual source of truth. Do not change the design language.
- Architecture decisions D1–D8 in `docs/ARCHITECTURE_PLAN.md` override anything later in that doc.
- Expo changes every SDK: before touching an Expo/RN API, check the docs for the SDK major in
  `apps/mobile/package.json` (https://docs.expo.dev/llms.txt). Add packages with `npx expo install`.
- Routes in `apps/mobile/src/app` stay thin; logic lives in `src/features/*`, visuals in `src/ui` and
  `src/commerce`. Colours only via `useTheme().colors` tokens — no hard-coded hex in screens.
- Money is integer cents. Prices render with tabular numerals. Amazon/`check_price` offers never show a number (D1).
- Public location data is the snapped ~1 km point only (D2). Never add exact coordinates to a public table, view or RPC.
- Every table gets RLS in the migration that creates it, plus pgTAP coverage in `supabase/tests`.
- Before declaring work done: `npm run typecheck && npm run lint && npm test`.
