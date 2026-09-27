# Vendored: @ybouane/liquidglass 1.0.3

Source: https://github.com/ybouane/liquidglass (MIT) — `dist/` build, unmodified.

Vendored rather than installed because the published package runs a
`patch-package` postinstall that fails in consuming projects. The bundle
already includes its patched `html-to-image` dependency.

Used by `src/ui/GlassProvider.tsx` for WebGL refraction on the toolbars.
