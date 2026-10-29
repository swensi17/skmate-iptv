# UI icons and welcome animation

- **Icons:** Phosphor Icons 2.1.1 (regular and fill weights), © 2023 Phosphor Icons, MIT License —
  the same family IconScout carries as the "Phosphor Icons" packs. Taken from the npm package
  `@phosphor-icons/core` and compiled into `app/src/main/java/tv/own/owntv/ui/components/PhosphorIcons.kt`
  by `tools/icons/gen_phosphor.py` (the mapping from app icons to Phosphor names lives there).
- **Welcome animation:** `app/src/main/res/raw/welcome_tv.json` (Lottie "TV"), chosen by the customer
  from IconScout (IconScout Simple License: free for commercial and personal use).
- **Profile avatars:** `app/src/main/res/raw/avatar_1.json` … `avatar_7.json` (Lottie "young man / girl /
  boy", "old age" avatars), chosen by the customer from IconScout (IconScout Simple License: free for commercial and personal use).
- Animation player: `com.airbnb.android:lottie-compose` (Apache-2.0).
- **Social marks (About page):** GitHub and Telegram from Phosphor Icons (the IconScout pack, free for commercial use),
  Twitter from Unicons (IconScout, free for commercial use, no attribution). SVG sources: `tools/icons/github.svg`,
  `telegram.svg`, `twitter.svg`; drawn by `ui/components/SocialIcons.kt`.

## Social marks (About page)

From IconScout, free for commercial use, no attribution required; converted to vector drawables in `app/src/main/res/drawable/`:
- `social_telegram.xml` — "Telegram", Icon 54 (flat, round).
- `social_github.xml` — "github", Sandy (flat); filled light for the grey sheet.
- `social_x.xml` — "x twitter", Sandy (flat), set in a round black badge.
