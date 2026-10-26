# Website prototype asset provenance

Prepared 2026-10-22 for the owner-private website review prototype. Source files belong to the existing local Unity project. Their presence in that project is not proof of permission for public website, promotion, marketing or sublicensing use. Do not treat this prototype as a licensed public photography release.

## Brand and fonts

| Website asset | Original source under `Assets/_Project/` | Use |
|---|---|---|
| `public/media/logo.png`, `public/media/logo-256.png` | `Art/Branding/logo-164-17.png` | Existing navy/gold aircraft and tower mark; original copy plus a 256px derivative for navigation |
| `public/fonts/Jost-SemiBold.ttf` | `UI/Fonts/Jost-SemiBold.ttf` | Wordmark only |
| `public/fonts/BarlowCondensed-Bold.ttf` | `UI/Fonts/BarlowCondensed-Bold.ttf` | Headings |
| `public/fonts/BarlowCondensed-SemiBold.ttf` | `UI/Fonts/BarlowCondensed-SemiBold.ttf` | Headings |
| `public/fonts/Poppins-Regular.ttf` | `UI/Fonts/Poppins-Regular.ttf` | Body text |
| `public/fonts/Poppins-Medium.ttf` | `UI/Fonts/Poppins-Medium.ttf` | Body emphasis and controls |

The original bundled `LICENSE-Jost-OFL.txt`, `OFL-BarlowCondensed.txt` and `OFL-Poppins.txt` notices are copied beside the fonts. Fonts are self-hosted; no Google Fonts request is needed.

## Real photography

The preparation script only resizes and recompresses originals, preserving their aspect ratio. No scene, aircraft detail, colour or identifying feature is generated, removed or retouched. Each photograph has a smaller `-640.jpg` derivative for responsive rendering. Photography remains contextual unless the original record explicitly supplies factual metadata.

| Website asset | Original source under `Assets/_Project/Content/ClientContent/Photos/` | Attribution evidence |
|---|---|---|
| `hero.jpg`, `aircraft.jpg` | `Identifier/ai-a1.jpg` | Identifier import defaults credit to Josh M; confirmation pending |
| `tail.jpg` | `Identifier/ai-a2.jpg` | Tail demo record `tail-ai-a2` carries Josh M credit; Identifier-wide confirmation still pending |
| `potd-4.jpg` | `Potd/pod-4.jpg` | POTD JSON: Josh M, `@iamjoshmark`, Boeing 737, "Beneath the Heartbeat" |
| `potd-5.jpg` | `Potd/pod-5.jpg` | POTD JSON: Josh M, `@iamjoshmark`, Airbus A380, "Golden Superjumbo" |
| `potd-6.jpg` | `Potd/pod-6.jpg` | POTD JSON: Josh M, `@iamjoshmark`, Boeing 757, "Threshold Geometry" |
| `potd-7.jpg` | `Potd/pod-7.jpg` | POTD JSON: Josh M, `@iamjoshmark`, Boeing 737-900ER, "Scimitar Silhouette" |
| `potd-8.jpg` | `Potd/pod-8.jpg` | POTD JSON: Josh M, `@iamjoshmark`, Boeing 747-8F, "Queen" |

The source POTD entries are in `Assets/_Project/Resources/ClientContent/potd.json`. Their provided photographer link is [Josh M on Instagram](https://www.instagram.com/iamjoshmark/). `docs/implementation/CLIENT_CONTENT_IMPORT.md` explicitly says the Identifier sheet has no photographer column and that the default Josh M attribution needs client confirmation. The later tail demo repeats that credit and describes its content as awaiting review. No contributor names or credits have been invented.

The POTD text is client-supplied metadata, not independently verified website publication evidence. A person approving photography must still check authorship, subject identity, allowed channels, license scope, attribution requirements, expiry and any withdrawal restrictions. App-only permission does not authorize website or marketing use.

## Deliberately absent imagery

No verified airport-identification photograph or runway diagram was found in the focused content sources. Airport Spotter and Runway Identifier therefore have no photo entry. ATC Match, Call Sign Match and Code Search also use nonphoto interface treatments. An unrelated aircraft photograph must not be presented as evidence of an airport, runway layout, ATC facility or actual game screenshot.

Seven catalog identities and their order come from `Scripts/Gameplay/Modules/ModuleRegistry.cs`; the eighth, Military Aircraft Identifier, is a client-confirmed variant of Aircraft Identifier whose working title and ID are not yet in the registry; gameplay descriptions use the loops in `CONCEPT.md`. Aircraft Identifier has backend ID `identifier` and public slug `aircraft-identifier`. Every catalog game is labelled "In development", because no production store release has been verified.

## Generated community illustration

`public/media/community.jpg` is an AI-generated decorative illustration for the community contributor section. It combines a camera lens, an aircraft wing and a control tower in the existing navy, gold and signal-red brand palette. It is not a photograph, game screenshot, real photographer submission or evidence of a specific aircraft, airport or ATC facility.

The generated source is `C:/Users/PC/.codex/generated_images/01a1636f-ad4e-75d1-a4cf-f29ade279732/exec-d4c20464-12c6-4f8e-bce9-15a8d793f63d.png` (2172x724). The website derivative is 1800x600 JPEG, quality 88, resized with Pillow using the same 3:1 aspect ratio. No factual game record may use this asset as photographic verification.

## Reproduce

The standalone website repository is now `H:/Work/TheAviationArcade/website`. From that directory, run `node scripts/prepare-assets.mjs` with a Python executable that already has Pillow. The default original-asset source is `C:/Unity/Projects/AviationArcade_v2`; set `WEBSITE_ASSET_SOURCE_ROOT` to override that Unity checkout. The script reads original project assets and writes only this website's `public/media` and `public/fonts` directories.

The bundled Pillow runtime used for this preparation is `C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`. Set `WEBSITE_ASSET_PYTHON` to that executable when the system `python` has no Pillow. To also regenerate the community JPEG, set `WEBSITE_COMMUNITY_SOURCE` to the generated source path above. Without that optional variable, the script keeps the checked-in community derivative intact.

This preparation used the bundled Codex Python runtime and Pillow. No libraries were installed and no external images were downloaded. The community illustration was generated separately by the image-generation tool, then resized locally.

### Web delivery derivatives

The final UI uses WebP photograph derivatives (quality 82), a lossless 144px WebP logo, and a
48px PNG favicon. WOFF2 versions of the unchanged brand fonts reduce transfer cost; the original
OFL notices remain alongside them. `scripts/optimize-assets.py` reproduces these derivatives after
`prepare-assets.mjs`. It needs Pillow, fontTools and Brotli. For this task only, the two font
conversion packages were installed under ignored `work/font-compression`; no runtime dependency
is needed to serve the checked-in font files. Original TTF and JPEG assets are preserved.
