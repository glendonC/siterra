# Design

Siterra's public design files. The approved hero (design language 1.3, approved by the founder on 27 Oct 2026) is specified in the reference pages, and they win over any picture: the [design system](../docs/reference/design-system.md), [scenes and views](../docs/reference/scenes.md#the-hero-sequence-design-language-13), [motion](../docs/reference/motion.md#the-hero-timeline-design-language-13), [components](../docs/reference/components.md#hero-components-design-language-13), [microcopy](../docs/reference/microcopy.md), [voice and tone](../docs/reference/voice-and-tone.md) and [UX architecture](../docs/reference/ux-architecture.md).

| Folder | Contents | Use it for |
|---|---|---|
| [tokens/](tokens/) | `siterra.tokens.json` (DTCG 2025.10: base scales, the light theme, which is the default, and the dark theme), `siterra.css` (generated from the tokens; do not edit by hand), `contrast-report.json` (WCAG and APCA for every role) | Generating the theme and checking contrast |
| `private/` (ignored) | Third-party captures and the private reference board | Local reference only; never commit or publish |

The earlier concept prototype, component gallery, motion storyboard and wireframes showed the island workspace that the approved hero replaced. They are not published.

## Third-party material

The light-theme NDVI ramp in the tokens uses the published cmocean "speed" colormap (MIT license). IBM Plex is licensed under the SIL Open Font License 1.1. The production app self-hosts its map assets and fonts ([map assets](../research/technology/map-assets.md)). AffectUI Pro components were studied for patterns only; no Pro code is in this repository ([ADR-0044](../docs/decisions/0044-build-the-interface-on-shadcn-with-base-ui-and-mit-components.md)).
